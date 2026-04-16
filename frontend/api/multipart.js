import crypto from 'crypto';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from '@aws-sdk/client-s3';
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
const PRESIGN_EXPIRY = 3600; // 1 hr for multipart pieces
const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';

const ALLOWED_CONTENT_TYPES = [
  'video/quicktime', 'video/mp4', 'video/x-msvideo', 'video/avi',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/tiff', 'image/bmp',
  'application/octet-stream',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { action, drop_token, ...payload } = req.body;

  if (!drop_token) {
    return res.status(400).json({ error: 'drop_token is required.' });
  }

  // Security: strict hex validation prevents filter injection
  if (!/^[a-f0-9]{64}$/.test(drop_token)) {
    return res.status(400).json({ error: 'Invalid drop token format.' });
  }

  // Common authorization check for the drop token
  try {
    const pbRes = await fetch(
      `${PB_URL}/api/collections/drops/records?filter=(token="${drop_token}" %26%26 (status="awaiting_uploads" || status="submitted"))&qtoken=${drop_token}&perPage=1`
    );
    const pbData = await pbRes.json();
    
    if (!pbData.items || pbData.items.length === 0) {
      return res.status(404).json({ error: 'Drop not found or no longer accepting uploads.' });
    }
  } catch (e) {
    console.error('PB Auth error:', e);
    return res.status(500).json({ error: 'Failed to authorize drop token.' });
  }

  try {
    if (action === 'start') {
      const { filename, content_type } = payload;
      if (!filename) return res.status(400).json({ error: 'filename required for start' });
      
      if (content_type && !ALLOWED_CONTENT_TYPES.includes(content_type)) {
        return res.status(400).json({ error: `Content type "${content_type}" is not allowed. Only video and image files are accepted.` });
      }

      const tokenHash = crypto.createHash('sha256').update(drop_token).digest('hex').substring(0, 16);
      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const s3Key = `drops/${tokenHash}/${Date.now()}_${safeName}`;

      const command = new CreateMultipartUploadCommand({
        Bucket: BUCKET,
        Key: s3Key,
        ContentType: content_type || 'application/octet-stream',
      });

      const response = await s3.send(command);
      return res.status(200).json({
        uploadId: response.UploadId,
        s3Key: response.Key
      });
      
    } else if (action === 'presign') {
      const { uploadId, s3Key, partNumbers } = payload;
      if (!uploadId || !s3Key || !Array.isArray(partNumbers)) {
        return res.status(400).json({ error: 'uploadId, s3Key, and partNumbers array required.' });
      }

      // Security: verify s3Key belongs to this drop's namespace
      const tokenHash = crypto.createHash('sha256').update(drop_token).digest('hex').substring(0, 16);
      if (!s3Key.startsWith(`drops/${tokenHash}/`)) {
        return res.status(403).json({ error: 'Access denied: invalid key path.' });
      }

      // Generate a presigned URL for each requested part
      const presignedUrls = await Promise.all(
        partNumbers.map(async (partNumber) => {
          const command = new UploadPartCommand({
            Bucket: BUCKET,
            Key: s3Key,
            PartNumber: partNumber,
            UploadId: uploadId,
          });
          const url = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRY });
          return { partNumber, url };
        })
      );

      return res.status(200).json({ parts: presignedUrls });

    } else if (action === 'complete') {
      const { uploadId, s3Key, parts } = payload;
      // 'parts' must be an array of { ETag, PartNumber }
      if (!uploadId || !s3Key || !Array.isArray(parts) || parts.length === 0) {
        return res.status(400).json({ error: 'uploadId, s3Key, and populated parts array required.' });
      }

      // Security: verify s3Key belongs to this drop's namespace
      const tokenHash = crypto.createHash('sha256').update(drop_token).digest('hex').substring(0, 16);
      if (!s3Key.startsWith(`drops/${tokenHash}/`)) {
        return res.status(403).json({ error: 'Access denied: invalid key path.' });
      }

      // AWS S3 Complete requires parts to be strictly sorted by PartNumber
      const sortedParts = parts.sort((a, b) => a.PartNumber - b.PartNumber);

      const command = new CompleteMultipartUploadCommand({
        Bucket: BUCKET,
        Key: s3Key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: sortedParts,
        },
      });

      await s3.send(command);
      return res.status(200).json({ success: true, s3Key });

    } else {
      return res.status(400).json({ error: `Invalid action: ${action}` });
    }
    
  } catch (e) {
    console.error('Multipart API error:', e);
    return res.status(500).json({ error: 'Internal multipart error: ' + e.message });
  }
}
