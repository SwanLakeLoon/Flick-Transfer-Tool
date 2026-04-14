import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import VideoPreview from '../../components/VideoPreview';
import pb from '../../utils/pb';
import { formatBytes, getPresignedDownloadUrl, uploadAdminResultCSV } from '../../utils/s3Upload';

const STATUS_TRANSITIONS = {
  awaiting_uploads: ['submitted'],
  submitted: ['processing'],
  processing: ['completed'],
  completed: ['processing'],
};

export default function AdminDropDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [drop, setDrop] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [csvFile, setCsvFile] = useState(null);
  const [isCsvUploading, setIsCsvUploading] = useState(false);
  const [csvProgress, setCsvProgress] = useState(0);

  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!pb.authStore.isValid || pb.authStore.record?.role !== 'admin') {
      pb.authStore.clear();
      navigate('/admin', { replace: true });
      return;
    }
    fetchDrop();
  }, [id, navigate]);

  const fetchDrop = async () => {
    try {
      const dropRecord = await pb.collection('drops').getOne(id);
      setDrop(dropRecord);

      const vidList = await pb.collection('videos').getFullList({
        filter: `drop="${id}"`,
        sort: '-created',
      });
      setVideos(vidList);
      setLoading(false);
    } catch (e) {
      if (e.isAbort) return;
      console.error(e);
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!confirm(`Change status to "${newStatus}"?`)) return;
    try {
      await pb.collection('drops').update(id, { status: newStatus });
      fetchDrop();
    } catch (e) {
      alert('Failed to update status: ' + e.message);
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFile) return;
    setIsCsvUploading(true);
    try {
      const { s3Key } = await uploadAdminResultCSV(pb.authStore.token, drop.id, csvFile, setCsvProgress);
      await pb.collection('drops').update(id, { result_key: s3Key, status: 'completed' });
      fetchDrop();
    } catch (e) {
      alert('Failed to upload results: ' + e.message);
    } finally {
      setIsCsvUploading(false);
      setCsvFile(null);
      setCsvProgress(0);
    }
  };

  const handleDeleteVideo = async (videoId) => {
    if (!confirm('Delete this video? This action cannot be undone.')) return;
    try {
      await pb.collection('videos').delete(videoId);
      setVideos(prev => prev.filter(v => v.id !== videoId));
    } catch (e) {
      alert('Failed to delete: ' + e.message);
    }
  };

  const handleDeleteDrop = async () => {
    if (!confirm('DELETE this entire drop and all its videos? This cannot be undone.')) return;
    try {
      // Delete all videos first
      for (const v of videos) {
        await pb.collection('videos').delete(v.id);
      }
      await pb.collection('drops').delete(id);
      navigate('/admin/dashboard');
    } catch (e) {
      alert('Failed to delete drop: ' + e.message);
    }
  };

  const handleDownloadVideo = async (video) => {
    try {
      const { presignedUrl } = await getPresignedDownloadUrl(video.s3_key, drop.token);
      // Open download in new tab
      const a = document.createElement('a');
      a.href = presignedUrl;
      a.download = video.original_name;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      alert('Failed to get download link: ' + e.message);
    }
  };

  const copyDropLink = () => {
    const url = `${window.location.origin}/drop/${drop.token}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  if (loading) {
    return (
      <>
        <Navbar admin />
        <main className="page">
          <div className="container text-center">
            <div className="spinner spinner--large" style={{ margin: '80px auto' }} />
          </div>
        </main>
      </>
    );
  }

  if (!drop) {
    return (
      <>
        <Navbar admin />
        <main className="page">
          <div className="container text-center">
            <h2>Drop not found</h2>
          </div>
        </main>
      </>
    );
  }

  const nextStatuses = STATUS_TRANSITIONS[drop.status] || [];
  const totalSize = videos.reduce((acc, v) => acc + (v.size_bytes || 0), 0);

  return (
    <>
      <Navbar admin />
      <main className="page">
        <div className="container">
          {/* Back button */}
          <button
            className="btn btn--secondary mb-lg"
            onClick={() => navigate('/admin/dashboard')}
            style={{ marginBottom: 'var(--space-lg)', fontSize: '0.85rem' }}
          >
            ← Back to Dashboard
          </button>

          {/* Header */}
          <div className="card card--elevated mb-lg" style={{ marginBottom: 'var(--space-lg)' }}>
            <div className="flex items-center justify-between" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
              <div>
                <h2 style={{ marginBottom: 'var(--space-sm)' }}>
                  Drop <code style={{ color: 'var(--text-accent)', fontSize: '0.85em' }}>{drop.token?.substring(0, 16)}…</code>
                </h2>
                <div style={{ marginBottom: 'var(--space-sm)', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <span className={`badge badge--${drop.status}`}>
                    <span className="badge__dot" />
                    {drop.status?.replace('_', ' ')}
                  </span>
                  <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: drop.uploader_name ? 'var(--text-main)' : 'var(--text-muted)' }}>
                    👤 {drop.uploader_name || 'Anonymous Uploader'}
                  </span>
                  {drop.recording_date && (
                    <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)' }}>
                      📅 {new Date(drop.recording_date).toLocaleDateString()}
                    </span>
                  )}
                  {drop.recording_location && (
                    <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)' }}>
                      📍 {drop.recording_location}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-sm" style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <button className="btn btn--secondary" onClick={copyDropLink} style={{ fontSize: '0.8rem' }}>
                  {linkCopied ? '✓ Copied!' : '📋 Copy Drop Link'}
                </button>
                {nextStatuses.map(s => (
                  <button
                    key={s}
                    className="btn btn--primary"
                    onClick={() => handleStatusChange(s)}
                    style={{ fontSize: '0.8rem' }}
                  >
                    → {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Info grid */}
            <div className="stat-grid mt-lg" style={{ marginTop: 'var(--space-lg)' }}>
              <div className="card stat-card">
                <div className="stat-card__value">{videos.length}</div>
                <div className="stat-card__label">Videos</div>
              </div>
              <div className="card stat-card">
                <div className="stat-card__value">{formatBytes(totalSize)}</div>
                <div className="stat-card__label">Total Size</div>
              </div>
              <div className="card stat-card">
                <div className="stat-card__value">{new Date(drop.created).toLocaleDateString()}</div>
                <div className="stat-card__label">Created</div>
              </div>
              <div className="card stat-card">
                <div className="stat-card__value" style={{ fontSize: '1rem' }}>
                  {drop.expires_at ? new Date(drop.expires_at).toLocaleDateString() : '—'}
                </div>
                <div className="stat-card__label">Expires</div>
              </div>
            </div>

            {/* CLI instructions & CSV Upload */}
            {drop.status === 'processing' && (
              <>
                <div className="banner banner--info mt-lg" style={{ marginTop: 'var(--space-lg)' }}>
                  <strong>CLI Pull Command:</strong>
                  <pre style={{
                    background: 'rgba(0,0,0,0.3)',
                    padding: 'var(--space-sm) var(--space-md)',
                    borderRadius: 'var(--radius-sm)',
                    marginTop: 'var(--space-sm)',
                    fontSize: '0.8rem',
                    overflowX: 'auto',
                    color: 'var(--text-accent)',
                  }}>
                    python scripts/pull_drop.py {drop.token} ./batch_folder/
                  </pre>
                </div>

                <div className="card mt-lg" style={{ borderColor: 'var(--accent-mid)', background: 'var(--bg-glass-hover)' }}>
                  <h4 style={{ marginBottom: 'var(--space-sm)' }}>Return Processed Results</h4>
                  <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
                    Once you've run the Flick AI pipeline, upload the resulting CSV here to complete the workflow.
                  </p>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                    <input 
                      type="file" 
                      accept=".csv" 
                      onChange={e => setCsvFile(e.target.files[0])}
                      disabled={isCsvUploading}
                      className="input"
                      style={{ flex: 1, padding: '4px' }}
                    />
                    <button 
                      className="btn btn--primary" 
                      onClick={handleCsvUpload} 
                      disabled={!csvFile || isCsvUploading}
                    >
                      {isCsvUploading ? `Uploading ${csvProgress}%` : 'Upload CSV'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* CSV Results Indicator */}
          {drop.result_key && (
            <div className="card mb-lg" style={{ borderColor: 'var(--status-completed)', background: 'rgba(16, 185, 129, 0.05)', marginBottom: 'var(--space-xl)' }}>
              <div className="flex items-center justify-between" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
                <div className="flex items-center gap-md" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--status-completed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', color: 'white', boxShadow: '0 0 20px rgba(16, 185, 129, 0.3)' }}>
                    📊
                  </div>
                  <div>
                    <h4 style={{ color: 'var(--status-completed)', margin: '0 0 4px 0' }}>Results File Attached</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                      <code style={{ color: 'var(--text-main)', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>
                        {drop.result_key.split('/').pop().replace(/^\d+_/, '')}
                      </code>
                    </p>
                  </div>
                </div>
                <button 
                  className="btn" 
                  style={{ background: 'var(--status-completed)', color: 'white', fontSize: '0.8rem' }}
                  title="Download Processed Results"
                  onClick={async () => {
                    try {
                      const { presignedUrl } = await getPresignedDownloadUrl(drop.result_key, drop.token);
                      const a = document.createElement('a');
                      a.href = presignedUrl;
                      a.download = drop.result_key.split('/').pop().replace(/^\d+_/, '');
                      a.target = '_blank';
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                    } catch (e) {
                      alert('Failed to get download link: ' + e.message);
                    }
                  }}
                >
                  ⬇ Download CSV
                </button>
              </div>
            </div>
          )}

          {/* Video list */}
          <h3 className="mb-md" style={{ marginBottom: 'var(--space-md)' }}>
            Videos ({videos.length})
          </h3>

          {videos.length === 0 ? (
            <div className="card text-center" style={{ padding: 'var(--space-2xl)' }}>
              <p className="text-muted">No videos uploaded yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {videos.map(v => (
                <div key={v.id} className="card" style={{ padding: 'var(--space-md)' }}>
                  <div className="flex items-center justify-between" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)' }}>
                    <div className="flex items-center gap-md" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>🎬</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.original_name}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {formatBytes(v.size_bytes)} · {v.content_type}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-sm" style={{ display: 'flex', gap: 'var(--space-sm)', flexShrink: 0 }}>
                      <VideoPreview s3Key={v.s3_key} dropToken={drop.token} filename={v.original_name} />
                      <button
                        className="btn btn--secondary"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        onClick={() => handleDownloadVideo(v)}
                      >
                        ⬇ Download
                      </button>
                      <button
                        className="btn btn--danger"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        onClick={() => handleDeleteVideo(v.id)}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Danger zone */}
          <div className="card mt-xl" style={{ marginTop: 'var(--space-xl)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
            <h4 style={{ color: 'var(--danger)', marginBottom: 'var(--space-sm)' }}>Danger Zone</h4>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
              Permanently delete this drop and all associated videos.
            </p>
            <button className="btn btn--danger" onClick={handleDeleteDrop}>
              🗑 Delete Entire Drop
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
