import { useState, useEffect } from 'react';
import { getPresignedDownloadUrl } from '../utils/s3Upload';

/**
 * Inline video preview using a presigned download URL.
 * Only loads the video when the user clicks "Preview".
 */
export default function VideoPreview({ s3Key, dropToken, filename }) {
  const [videoUrl, setVideoUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handlePreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const { presignedUrl } = await getPresignedDownloadUrl(s3Key, dropToken);
      setVideoUrl(presignedUrl);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (videoUrl) {
    return (
      <div style={{ marginTop: 'var(--space-sm)' }}>
        <video
          controls
          preload="metadata"
          style={{
            width: '100%',
            maxHeight: 300,
            borderRadius: 'var(--radius-md)',
            background: '#000',
          }}
        >
          <source src={videoUrl} />
          Your browser does not support video playback.
        </video>
        <button
          className="btn btn--secondary"
          style={{ marginTop: 8, fontSize: '0.75rem', padding: '4px 10px' }}
          onClick={() => setVideoUrl(null)}
        >
          Close Preview
        </button>
      </div>
    );
  }

  return (
    <button
      className="btn btn--secondary"
      style={{ fontSize: '0.75rem', padding: '4px 10px' }}
      onClick={handlePreview}
      disabled={loading}
    >
      {loading ? '…' : '▶ Preview'}
      {error && <span style={{ color: 'var(--danger)', marginLeft: 6 }}>{error}</span>}
    </button>
  );
}
