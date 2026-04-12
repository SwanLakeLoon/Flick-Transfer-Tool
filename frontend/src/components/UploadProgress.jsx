import { formatBytes } from '../utils/s3Upload';

/**
 * Renders a single file with upload progress.
 * status: 'pending' | 'uploading' | 'done' | 'error'
 */
export default function UploadProgress({ file, progress, status, errorMsg, onRemove }) {
  const statusIcon = {
    pending: '⏳',
    uploading: '📤',
    done: '✅',
    error: '❌',
  }[status] || '📄';

  return (
    <div className="file-item" id={`file-${file.name.replace(/\W/g, '_')}`}>
      <span className="file-item__icon">{statusIcon}</span>
      <div className="file-item__info">
        <div className="file-item__name">{file.name}</div>
        <div className="file-item__meta">
          {formatBytes(file.size)}
          {status === 'error' && errorMsg && (
            <span style={{ color: 'var(--danger)', marginLeft: 8 }}>{errorMsg}</span>
          )}
        </div>
        {status === 'uploading' && (
          <div className="progress-bar mt-md" style={{ marginTop: 8 }}>
            <div className="progress-bar__fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <div className="file-item__actions">
        {status === 'uploading' && (
          <span style={{ color: 'var(--text-accent)', fontSize: '0.8rem', fontWeight: 600 }}>
            {progress}%
          </span>
        )}
        {(status === 'pending' || status === 'error') && onRemove && (
          <button className="file-item__remove" onClick={onRemove} title="Remove">✕</button>
        )}
      </div>
    </div>
  );
}
