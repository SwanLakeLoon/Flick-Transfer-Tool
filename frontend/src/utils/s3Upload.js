/**
 * S3 Upload Utilities
 * Handles presigned URL fetching and direct-to-S3 uploads with progress tracking.
 */

// Vercel Serverless API routes
const API_BASE = '/api';

// Max chunk size for multipart uploads
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
  const res = await fetch(`${API_BASE}/presign`, {
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
  const res = await fetch(`${API_BASE}/presign-download?${params}`);
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
    let lastUpdate = 0;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const now = Date.now();
        // Update at most every 200ms or 100% to prevent React re-render freezing
        if (now - lastUpdate > 200 || e.loaded === e.total) {
          lastUpdate = now;
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
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

export async function startMultipartUpload(dropToken, filename, contentType) {
  const res = await fetch(`${API_BASE}/multipart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start', drop_token: dropToken, filename, content_type: contentType }),
  });
  if (!res.ok) throw new Error('Multipart start failed');
  return res.json();
}

export async function getMultipartPresignedUrls(dropToken, uploadId, s3Key, partNumbers) {
  const res = await fetch(`${API_BASE}/multipart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'presign', drop_token: dropToken, uploadId, s3Key, partNumbers }),
  });
  if (!res.ok) throw new Error('Multipart presign failed');
  return res.json();
}

export async function completeMultipartUpload(dropToken, uploadId, s3Key, parts) {
  const res = await fetch(`${API_BASE}/multipart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'complete', drop_token: dropToken, uploadId, s3Key, parts }),
  });
  if (!res.ok) throw new Error('Multipart complete failed');
  return res.json();
}

export function uploadPartToS3(presignedUrl, chunkBlob, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastUpdate = 0;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const now = Date.now();
        if (now - lastUpdate > 200 || e.loaded === e.total) {
          lastUpdate = now;
          onProgress(e.loaded);
        }
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let etag = xhr.getResponseHeader('ETag');
        if (etag) etag = etag.replace(/"/g, ''); 
        resolve(etag);
      } else {
        reject(new Error(`Upload part failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload part network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload part aborted')));

    if (signal) signal.addEventListener('abort', () => xhr.abort());

    xhr.open('PUT', presignedUrl);
    xhr.send(chunkBlob);
  });
}

/**
 * Full upload flow: routes seamlessly between fast-track and multi-part concurrent uploads.
 * @param {string} dropToken
 * @param {File} file
 * @param {function} onProgress
 * @param {AbortSignal} [signal]
 * @returns {Promise<{s3Key: string}>}
 */
export async function uploadFile(dropToken, file, onProgress, signal) {
  const contentType = file.type || 'application/octet-stream';

  if (file.size <= MULTIPART_THRESHOLD) {
    const { presignedUrl, s3Key } = await getPresignedUploadUrl(dropToken, file.name, contentType);
    await uploadToS3(presignedUrl, file, onProgress, signal);
    return { s3Key };
  }

  // Multipart flow initialized
  const { uploadId, s3Key } = await startMultipartUpload(dropToken, file.name, contentType);
  
  const totalParts = Math.ceil(file.size / CHUNK_SIZE);
  const partsList = Array.from({ length: totalParts }, (_, i) => i + 1);
  const { parts } = await getMultipartPresignedUrls(dropToken, uploadId, s3Key, partsList);

  const completedParts = [];
  const partProgressMap = new Map();
  
  const updateAggregateProgress = () => {
    let totalLoaded = 0;
    for (const bytes of partProgressMap.values()) totalLoaded += bytes;
    onProgress(Math.round((totalLoaded / file.size) * 100));
  };

  const maxConcurrency = 4;
  let running = 0;
  let partIndex = 0;
  let masterError = null;

  await new Promise((resolve, reject) => {
    const enqueue = () => {
      if (masterError) return;
      if (partIndex >= totalParts && running === 0) {
        resolve();
        return;
      }

      while (running < maxConcurrency && partIndex < totalParts) {
        const i = partIndex++;
        const partNumber = parts[i].partNumber;
        const presignedUrl = parts[i].url;

        const startByte = (partNumber - 1) * CHUNK_SIZE;
        const endByte = Math.min(startByte + CHUNK_SIZE, file.size);
        const chunk = file.slice(startByte, endByte);

        running++;

        uploadPartToS3(presignedUrl, chunk, (loadedBytes) => {
          partProgressMap.set(partNumber, loadedBytes);
          updateAggregateProgress();
        }, signal)
          .then(ETag => {
            completedParts.push({ PartNumber: partNumber, ETag });
            partProgressMap.set(partNumber, chunk.size);
            updateAggregateProgress();
            running--;
            enqueue();
          })
          .catch(err => {
            masterError = err;
            reject(err);
          });
      }
    };
    enqueue();
  });

  await completeMultipartUpload(dropToken, uploadId, s3Key, completedParts);
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
