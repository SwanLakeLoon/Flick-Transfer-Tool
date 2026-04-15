import crypto from 'crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
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
const PRESIGN_EXPIRY = 900; 
const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { key, drop_token } = req.query;

  if (!key || !drop_token) {
    return res.status(400).json({ error: 'key and drop_token are required.' });
  }

  // Security: strict hex validation prevents filter injection
  if (!/^[a-f0-9]{64}$/.test(drop_token)) {
    return res.status(400).json({ error: 'Invalid drop token format.' });
  }

  try {
    const pbRes = await fetch(
      `${PB_URL}/api/collections/drops/records?filter=(token="${drop_token}")&qtoken=${drop_token}&perPage=1`
    );
    const pbData = await pbRes.json();
    
    if (!pbData.items || pbData.items.length === 0) {
      return res.status(404).json({ error: 'Drop not found.' });
    }

    const tokenHash = crypto.createHash('sha256').update(drop_token).digest('hex').substring(0, 16);
    const dropId = pbData.items[0].id;
    
    if (!key.startsWith(`drops/${tokenHash}/`) && !key.startsWith(`results/${dropId}/`)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Extract clean filename from the S3 key (strip timestamp prefix)
    const rawFilename = key.split('/').pop().replace(/^\d+_/, '') || 'download';

    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${rawFilename}"`,
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRY });
    res.status(200).json({ presignedUrl });
  } catch (e) {
    console.error('Presign-download error:', e);
    res.status(500).json({ error: 'Internal error generating download URL.' });
  }
}
