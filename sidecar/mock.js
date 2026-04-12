/**
 * Mock Sidecar for local testing.
 * Instead of S3 presigned URLs, this serves files from/to a local directory
 * and exposes the same API surface as the real sidecar.
 */

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { writeFileSync, mkdirSync, existsSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = join(__dirname, '..', '_test_storage');
mkdirSync(STORAGE_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());

const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8091';

/**
 * POST /presign
 * In mock mode: returns a URL pointing back to this server for the actual upload.
 */
app.post('/presign', async (req, res) => {
  const { drop_token, filename, content_type } = req.body;
  if (!drop_token || !filename) {
    return res.status(400).json({ error: 'drop_token and filename required' });
  }

  try {
    // Validate drop exists
    const pbRes = await fetch(
      `${PB_URL}/api/collections/drops/records?filter=(token="${drop_token}")&qtoken=${drop_token}&perPage=1`
    );
    const pbData = await pbRes.json();
    console.log("PBDATA:", pbData); if (!pbData.items || pbData.items.length === 0) {
      return res.status(404).json({ error: 'Drop not found.' });
    }

    const tokenHash = crypto.createHash('sha256').update(drop_token).digest('hex').substring(0, 16);
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `drops/${tokenHash}/${Date.now()}_${safeName}`;

    // Ensure directory exists
    const fullDir = join(STORAGE_DIR, dirname(s3Key));
    mkdirSync(fullDir, { recursive: true });

    // Return a URL to our own upload endpoint
    const port = process.env.PORT || 4000;
    const presignedUrl = `http://127.0.0.1:${port}/mock-upload/${encodeURIComponent(s3Key)}`;

    res.json({ presignedUrl, s3Key });
  } catch (e) {
    console.error('Presign error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * PUT /mock-upload/:key
 * Receives the actual file bytes and writes to local disk.
 */
app.put('/mock-upload/*', (req, res) => {
  // The key is everything after /mock-upload/
  const s3Key = decodeURIComponent(req.params[0] || req.url.split('/mock-upload/')[1]);
  const filePath = join(STORAGE_DIR, s3Key);
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const buffer = Buffer.concat(chunks);
    writeFileSync(filePath, buffer);
    console.log(`  📦 Stored ${s3Key} (${(buffer.length / 1048576).toFixed(1)} MB)`);
    res.status(200).send('OK');
  });
  req.on('error', (e) => {
    console.error('Upload error:', e);
    res.status(500).send('Upload failed');
  });
});

/**
 * GET /presign-download?key=...&drop_token=...
 * Returns a URL pointing to our local file server.
 */
app.get('/presign-download', async (req, res) => {
  const { key, drop_token } = req.query;
  if (!key || !drop_token) {
    return res.status(400).json({ error: 'key and drop_token required' });
  }

  const filePath = join(STORAGE_DIR, key);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const port = process.env.PORT || 4000;
  res.json({ presignedUrl: `http://127.0.0.1:${port}/mock-download/${encodeURIComponent(key)}` });
});

/**
 * GET /mock-download/:key
 * Serves the file from local storage.
 */
app.get('/mock-download/*', (req, res) => {
  const s3Key = decodeURIComponent(req.params[0] || req.url.split('/mock-download/')[1]);
  const filePath = join(STORAGE_DIR, s3Key);
  if (!existsSync(filePath)) {
    return res.status(404).send('Not found');
  }
  createReadStream(filePath).pipe(res);
});

/**
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: 'mock', storage: STORAGE_DIR });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`⚡ Mock Sidecar listening on port ${PORT}`);
  console.log(`   Storage: ${STORAGE_DIR}`);
  console.log(`   PocketBase: ${PB_URL}`);
});
