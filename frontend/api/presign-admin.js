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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { drop_id, filename, content_type } = req.body;
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  if (!drop_id || !filename) {
    return res.status(400).json({ error: 'drop_id and filename are required.' });
  }

  try {
    // Authenticate the admin using a PocketBase trick:
    // Try to fetch the specific Drop by ID relying strictly on the bearer token.
    // The collection ViewRule demands `@request.auth.role ?= "admin"` to allow access without a qtoken.
    // Therefore, if this fetch succeeds, the token strictly belongs to a valid Admin or Superuser!
    const pbRes = await fetch(`${PB_URL}/api/collections/drops/records/${drop_id}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader
      }
    });
    
    if (!pbRes.ok) {
      return res.status(403).json({ error: 'Forbidden: Invalid credentials or drop does not exist.' });
    }

    const dropRecord = await pbRes.json();
    
    // Safety check just in case
    if (!dropRecord || !dropRecord.id) {
        return res.status(403).json({ error: 'Forbidden: Record inaccessible.' });
    }

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    // Save to results/drop_id/...
    const s3Key = `results/${drop_id}/${Date.now()}_${safeName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: content_type || 'text/csv',
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRY });
    res.status(200).json({ presignedUrl, s3Key });
  } catch (e) {
    console.error('Admin Presign error:', e);
    res.status(500).json({ error: 'Internal error generating admin presigned URL.' });
  }
}
