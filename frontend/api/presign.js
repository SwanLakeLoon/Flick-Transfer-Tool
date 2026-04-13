import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: process.env.S3_REGION || 'fsn1',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.S3_BUCKET || 'flick-inbox';
const PRESIGN_EXPIRY = 900; // 15 mins
const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';

const ALLOWED_CONTENT_TYPES = [
  'video/quicktime', 'video/mp4', 'video/x-msvideo', 'video/avi',
  'application/octet-stream',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { drop_token, filename, content_type } = req.body;

  if (!drop_token || !filename) {
    return res.status(400).json({ error: 'drop_token and filename are required.' });
  }

  // Security: strict hex validation prevents filter injection
  if (!/^[a-f0-9]{64}$/.test(drop_token)) {
    return res.status(400).json({ error: 'Invalid drop token format.' });
  }

  if (content_type && !ALLOWED_CONTENT_TYPES.includes(content_type)) {
    return res.status(400).json({ error: `Content type "${content_type}" is not allowed. Only video files are accepted.` });
  }

  try {
    const pbRes = await fetch(
      `${PB_URL}/api/collections/drops/records?filter=(token="${drop_token}" %26%26 (status="awaiting_uploads" || status="submitted"))&qtoken=${drop_token}&perPage=1`
    );
    const pbData = await pbRes.json();
    
    if (!pbData.items || pbData.items.length === 0) {
      return res.status(404).json({ error: 'Drop not found or no longer accepting uploads.' });
    }

    const tokenHash = crypto.createHash('sha256').update(drop_token).digest('hex').substring(0, 16);
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `drops/${tokenHash}/${Date.now()}_${safeName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: content_type || 'application/octet-stream',
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRY });
    res.status(200).json({ presignedUrl, s3Key });
  } catch (e) {
    console.error('Presign error:', e);
    res.status(500).json({ error: 'Internal error generating presigned URL.' });
  }
}
