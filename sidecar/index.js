/**
 * Flick File Transfer — Presigned URL Sidecar
 * 
 * A tiny Express service that generates presigned S3 URLs
 * for direct browser→S3 uploads and downloads.
 * Credentials never reach the frontend.
 */

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const app = express();
app.use(express.json());

// CORS — allow frontend origins
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({ origin: ALLOWED_ORIGINS }));

// S3 client pointing to Hetzner Object Storage
const s3 = new S3Client({
  region: process.env.S3_REGION || 'fsn1',
  endpoint: process.env.S3_ENDPOINT || 'https://fsn1.your-objectstorage.com',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.S3_BUCKET || 'flick-inbox';
const PRESIGN_EXPIRY = 900; // 15 minutes

// PocketBase URL for validation
const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';

const ALLOWED_CONTENT_TYPES = [
  'video/quicktime', 'video/mp4', 'video/x-msvideo', 'video/avi',
  'application/octet-stream',
];

// Rate limit: simple in-memory map. Key = IP, value = { count, resetAt }
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 200; // 200 requests per minute to support bulk max-limit (50 chunks)

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimits.set(ip, entry);
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

/**
 * POST /presign
 * Body: { drop_token, filename, content_type }
 * Returns: { presignedUrl, s3Key }
 */
app.post('/presign', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
  }

  const { drop_token, filename, content_type } = req.body;

  if (!drop_token || !filename) {
    return res.status(400).json({ error: 'drop_token and filename are required.' });
  }

  if (content_type && !ALLOWED_CONTENT_TYPES.includes(content_type)) {
    return res.status(400).json({ error: `Content type "${content_type}" is not allowed. Only video files are accepted.` });
  }

  try {
    // Validate the drop exists and is in the right state
    const pbRes = await fetch(
      `${PB_URL}/api/collections/drops/records?filter=(token="${drop_token}" %26%26 status="awaiting_uploads")&qtoken=${drop_token}&perPage=1`
    );
    const pbData = await pbRes.json();
    if (!pbData.items || pbData.items.length === 0) {
      return res.status(404).json({ error: 'Drop not found or no longer accepting uploads.' });
    }

    // Hash the token for the S3 prefix (don't store raw tokens in S3 keys)
    const tokenHash = crypto.createHash('sha256').update(drop_token).digest('hex').substring(0, 16);
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `drops/${tokenHash}/${Date.now()}_${safeName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: content_type || 'application/octet-stream',
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRY });

    res.json({ presignedUrl, s3Key });
  } catch (e) {
    console.error('Presign error:', e);
    res.status(500).json({ error: 'Internal error generating presigned URL.' });
  }
});

/**
 * GET /presign-download?key=...&drop_token=...
 * Returns: { presignedUrl }
 */
app.get('/presign-download', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }

  const { key, drop_token } = req.query;

  if (!key || !drop_token) {
    return res.status(400).json({ error: 'key and drop_token are required.' });
  }

  try {
    // Validate the token belongs to a real drop
    const pbRes = await fetch(
      `${PB_URL}/api/collections/drops/records?filter=(token="${drop_token}")&qtoken=${drop_token}&perPage=1`
    );
    const pbData = await pbRes.json();
    if (!pbData.items || pbData.items.length === 0) {
      return res.status(404).json({ error: 'Drop not found.' });
    }

    // Verify the S3 key belongs to this drop's token hash
    const tokenHash = crypto.createHash('sha256').update(drop_token).digest('hex').substring(0, 16);
    if (!key.startsWith(`drops/${tokenHash}/`) && !key.startsWith(`results/${tokenHash}/`)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRY });

    res.json({ presignedUrl });
  } catch (e) {
    console.error('Presign-download error:', e);
    res.status(500).json({ error: 'Internal error generating download URL.' });
  }
});

/**
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`⚡ Flick Sidecar listening on port ${PORT}`);
});
