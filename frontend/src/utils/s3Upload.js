/**
 * S3 Upload Utilities
 * Handles presigned URL fetching and direct-to-S3 uploads with progress tracking.
 */

const SIDECAR_URL = import.meta.env.VITE_SIDECAR_URL || 'http://127.0.0.1:4000';

// Max chunk size for multipart uploads: 10MB
const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB → use multipart
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Request a presigned PUT URL from the sidecar.
 * @param {string} dropToken - The magic link token for this drop
 * @param {string} filename - Original filename
 * @param {string} contentType - MIME type
 * @returns {Promise<{presignedUrl: string, s3Key: string}>}
 */
export async function getPresignedUploadUrl(dropToken, filename, contentType) {
  const res = await fetch(`${SIDECAR_URL}/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drop_token: dropToken, filename, content_type: contentType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Presign request failed' }));
    throw new Error(err.error || `Presign failed (${res.status})`);
  }
  return res.json();
}

/**
 * Request a presigned GET URL from the sidecar for downloading.
 * @param {string} s3Key - The S3 object key
 * @param {string} dropToken - The magic link token (for validation)
 * @returns {Promise<{presignedUrl: string}>}
 */
export async function getPresignedDownloadUrl(s3Key, dropToken) {
  const params = new URLSearchParams({ key: s3Key, drop_token: dropToken });
  const res = await fetch(`${SIDECAR_URL}/presign-download?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Download presign failed' }));
    throw new Error(err.error || `Download presign failed (${res.status})`);
  }
  return res.json();
}

/**
 * Upload a file directly to S3 via presigned URL with progress tracking.
 * Uses XMLHttpRequest for progress events.
 * 
 * @param {string} presignedUrl - The presigned PUT URL
 * @param {File} file - The file to upload
 * @param {function} onProgress - Callback: (percent: number) => void
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Promise<void>}
 */
export function uploadToS3(presignedUrl, file, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    if (signal) {
      signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}

/**
 * Full upload flow: get presigned URL, upload file, return s3Key.
 * @param {string} dropToken
 * @param {File} file
 * @param {function} onProgress
 * @param {AbortSignal} [signal]
 * @returns {Promise<{s3Key: string}>}
 */
export async function uploadFile(dropToken, file, onProgress, signal) {
  const contentType = file.type || 'application/octet-stream';
  const { presignedUrl, s3Key } = await getPresignedUploadUrl(dropToken, file.name, contentType);
  await uploadToS3(presignedUrl, file, onProgress, signal);
  return { s3Key };
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
