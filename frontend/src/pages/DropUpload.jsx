import { useParams } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from '../components/Navbar';
import FileDropzone from '../components/FileDropzone';
import UploadProgress from '../components/UploadProgress';
import pb from '../utils/pb';
import { uploadFile, formatBytes, getPresignedDownloadUrl } from '../utils/s3Upload';

// Maximum files per drop
const MAX_FILES = 50;
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

export default function DropUpload() {
  const { token } = useParams();
  const [drop, setDrop] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Upload state: array of { file, status, progress, errorMsg, s3Key }
  const [uploads, setUploads] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [showAddMore, setShowAddMore] = useState(false);

  // Fetch the drop and its videos
  const fetchDrop = useCallback(async () => {
    try {
      // Pass token as query param for PB API rule: `token = @request.query.token`
      const results = await pb.collection('drops').getList(1, 1, {
        filter: `token="${token}"`,
        query: { qtoken: token },
      });
      if (results.items.length === 0) {
        setError('Drop not found. Please check your link.');
        setLoading(false);
        return;
      }
      const dropRecord = results.items[0];
      setDrop(dropRecord);

      const vidList = await pb.collection('videos').getFullList({
        filter: `drop="${dropRecord.id}"`,
        sort: '-created',
        query: { qtoken: token },
      });
      setVideos(vidList);
      setLoading(false);
    } catch (err) {
      if (err.isAbort) return;
      setError('Failed to load submission. Please check your link and try again.');
      console.error(err);
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchDrop(); }, [fetchDrop]);

  // Handle new files selected from dropzone
  const handleFilesSelected = useCallback((files) => {
    const existing = uploads.length + videos.length;
    if (existing + files.length > MAX_FILES) {
      alert(`Maximum ${MAX_FILES} files per submission. You can add ${MAX_FILES - existing} more.`);
      return;
    }

    const newUploads = [];
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        alert(`${f.name} exceeds the 2GB file size limit.`);
        continue;
      }
      // Check for duplicates
      const alreadyExists = videos.some(v => v.original_name === f.name && v.size_bytes === f.size) ||
                            uploads.some(u => u.file.name === f.name && u.file.size === f.size);
      if (alreadyExists) {
        alert(`${f.name} appears to already be uploaded or queued.`);
        continue;
      }
      newUploads.push({ file: f, status: 'pending', progress: 0, errorMsg: null, s3Key: null });
    }
    setUploads(prev => [...prev, ...newUploads]);
  }, [uploads, videos]);

  // Remove a pending file
  const handleRemove = useCallback((idx) => {
    setUploads(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // Start uploading all pending files
  const handleUploadAll = useCallback(async () => {
    if (!drop) return;
    setIsUploading(true);

    const pendingIndices = uploads
      .map((u, i) => (u.status === 'pending' || u.status === 'error') ? i : -1)
      .filter(i => i >= 0);

    for (const idx of pendingIndices) {
      const upload = uploads[idx];
      // Mark as uploading
      setUploads(prev => prev.map((u, i) => i === idx ? { ...u, status: 'uploading', progress: 0, errorMsg: null } : u));

      try {
        const { s3Key } = await uploadFile(
          token,
          upload.file,
          (pct) => setUploads(prev => prev.map((u, i) => i === idx ? { ...u, progress: pct } : u)),
        );

        // Create metadata record in PocketBase
        await pb.collection('videos').create({
          drop: drop.id,
          s3_key: s3Key,
          original_name: upload.file.name,
          size_bytes: upload.file.size,
          content_type: upload.file.type || 'application/octet-stream',
          uploaded_at: new Date().toISOString(),
        });

        setUploads(prev => prev.map((u, i) => i === idx ? { ...u, status: 'done', progress: 100, s3Key } : u));
      } catch (err) {
        setUploads(prev => prev.map((u, i) => i === idx ? { ...u, status: 'error', errorMsg: err.message } : u));
      }
    }

    // Refresh video list and drop
    await fetchDrop();
    setUploads(prev => prev.filter(u => u.status !== 'done'));
    setIsUploading(false);
    
    // Show success message
    setSuccessMessage(`Successfully uploaded ${pendingIndices.length} file(s)!`);
    setTimeout(() => setSuccessMessage(null), 3000);
  }, [drop, token, uploads, fetchDrop]);

  // Submit for processing
  const handleSubmit = async () => {
    if (!drop) return;
    if (!confirm('Submit this batch for processing?')) return;
    try {
      await pb.collection('drops').update(drop.id, {
        status: 'submitted',
        video_count: videos.length,
      }, { query: { qtoken: token } });
      fetchDrop();
    } catch (err) {
      console.error('Submit error:', err?.data || err);
      const detail = err?.data?.data ? JSON.stringify(err.data.data) : (err?.message || 'Unknown error');
      alert('Failed to submit: ' + detail);
    }
  };

  // Download results CSV
  const handleDownloadCSV = async () => {
    if (!drop?.result_key) return;
    try {
      const { presignedUrl } = await getPresignedDownloadUrl(drop.result_key, token);
      window.open(presignedUrl, '_blank');
    } catch (err) {
      alert('Failed to get download link: ' + err.message);
    }
  };

  // Remove an already-uploaded video (before submission)
  const handleRemoveVideo = async (videoId) => {
    if (!confirm('Remove this video from your submission?')) return;
    try {
      await pb.collection('videos').delete(videoId, { query: { qtoken: token } });
      setVideos(prev => prev.filter(v => v.id !== videoId));
    } catch (err) {
      alert('Failed to remove video: ' + err.message);
    }
  };

  // Copy magic link
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // Determine UI state
  const isLocked = drop && drop.status !== 'awaiting_uploads';
  const pendingCount = uploads.filter(u => u.status === 'pending' || u.status === 'error').length;
  const doneCount = uploads.filter(u => u.status === 'done').length;
  const totalVideoCount = videos.length + doneCount;
  const isSubmittedView = drop && drop.status === 'submitted' && !showAddMore;

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="page">
          <div className="container container--narrow text-center">
            <div className="spinner spinner--large" style={{ margin: '80px auto' }} />
            <p className="text-muted mt-md">Loading your submission…</p>
          </div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navbar />
        <main className="page">
          <div className="container container--narrow text-center">
            <div className="status-hero">
              <div className="status-hero__icon">🔍</div>
              <h2>Submission Not Found</h2>
              <p className="text-muted mt-md">{error}</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (isSubmittedView) {
    return (
      <>
        <Navbar />
        <main className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <div className="container container--narrow text-center">
            <div className="card card--elevated" style={{ padding: 'var(--space-3xl) var(--space-xl)', background: 'linear-gradient(180deg, rgba(20, 17, 42, 0.8) 0%, rgba(20, 17, 42, 0.4) 100%)', borderTop: '2px solid var(--accent-mid)' }}>
               {/* Massive Checkmark Hero Graphic */}
               <div style={{ animation: 'slideIn 0.8s var(--ease-out)', marginBottom: 'var(--space-xl)' }}>
                 <div style={{ width: '96px', height: '96px', borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-lg)', boxShadow: '0 0 60px var(--accent-glow)' }}>
                   <span style={{ fontSize: '3.5rem', color: 'white', textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>✓</span>
                 </div>
                 <h2 style={{ fontSize: '2.5rem', marginBottom: 'var(--space-sm)' }}>Success!</h2>
                 <p className="text-secondary" style={{ fontSize: '1.1rem' }}>
                   Your {totalVideoCount} video{totalVideoCount !== 1 ? 's' : ''} have been securely submitted for processing.
                 </p>
               </div>

               <div className="banner banner--info" style={{ textAlign: 'left', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
                 <strong>🔗 Bookmark this page!</strong> This is your private link to monitor the job and retrieve your results.
                 <div className="magic-link-box" style={{ background: 'rgba(0,0,0,0.5)', borderColor: 'transparent' }}>
                   <span className="magic-link-box__url" style={{ fontSize: '0.9rem' }}>{window.location.href}</span>
                   <button className="magic-link-box__copy" onClick={handleCopyLink} title="Copy link">
                     {linkCopied ? '✓' : '📋'}
                   </button>
                 </div>
               </div>

               <button className="btn btn--secondary mt-lg" onClick={() => setShowAddMore(true)}>
                 Need to add more files?
               </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="page">
        <div className="container container--narrow">
          {/* Status header */}
          <div className="flex items-center justify-between mb-lg">
            <div>
              <h2>
                {drop.status === 'completed' ? '📊 Results Ready' :
                 drop.status === 'processing' ? '⏳ Processing…' :
                 '📤 Upload Videos'}
              </h2>
              <span className={`badge badge--${drop.status}`}>
                <span className="badge__dot" />
                {drop.status.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Magic link reminder */}
          <div className="banner banner--info">
            <strong>🔗 Save this link!</strong> This is your private link to this submission. Bookmark it or copy it now.
            <div className="magic-link-box">
              <span className="magic-link-box__url">{window.location.href}</span>
              <button className="magic-link-box__copy" onClick={handleCopyLink} title="Copy link">
                {linkCopied ? '✓' : '📋'}
              </button>
            </div>
          </div>

          {/* Completed — show download */}
          {drop.status === 'completed' && drop.result_key && (
            <div className="card card--elevated text-center" style={{ padding: 'var(--space-2xl)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>📊</div>
              <h3>Your results are ready!</h3>
              <p className="text-muted mt-md mb-lg">
                The pipeline has finished processing your {totalVideoCount} video(s).
              </p>
              <button
                id="download-csv-btn"
                className="btn btn--primary btn--large"
                onClick={handleDownloadCSV}
              >
                ⬇ Download Results CSV
              </button>
            </div>
          )}

          {/* Processing — waiting state */}
          {(drop.status === 'processing') && (
            <div className="card card--elevated text-center" style={{ padding: 'var(--space-2xl)' }}>
              <div className="spinner spinner--large" style={{ margin: '0 auto var(--space-lg)' }} />
              <h3>Your videos are being processed…</h3>
              <p className="text-muted mt-md">
                Check back later. This page will show your results when they're ready.
              </p>
            </div>
          )}

          {/* Upload zone (when awaiting or submitted) */}
          {(drop.status === 'awaiting_uploads' || drop.status === 'submitted') && (
            <>
              <FileDropzone onFilesSelected={handleFilesSelected} disabled={isUploading} />

              {successMessage && (
                <div className="banner banner--success mt-md" style={{ marginTop: 'var(--space-md)', textAlign: 'center', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  ✅ {successMessage}
                </div>
              )}

              {/* Pending uploads */}
              {uploads.length > 0 && (
                <div className="flex-col gap-sm mt-lg" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)' }}>
                  {uploads.map((u, i) => (
                    <UploadProgress
                      key={`${u.file.name}-${u.file.size}`}
                      file={u.file}
                      progress={u.progress}
                      status={u.status}
                      errorMsg={u.errorMsg}
                      onRemove={u.status !== 'done' && u.status !== 'uploading' ? () => handleRemove(i) : null}
                    />
                  ))}
                </div>
              )}

              {/* Action buttons */}
              {pendingCount > 0 && (
                <div className="flex gap-md mt-lg" style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-lg)' }}>
                  <button
                    id="upload-all-btn"
                    className="btn btn--primary btn--large w-full"
                    onClick={handleUploadAll}
                    disabled={isUploading}
                    style={{ flex: 1 }}
                  >
                    {isUploading ? (
                      <>
                        <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                        Uploading…
                      </>
                    ) : (
                      `📤 Upload ${pendingCount} File${pendingCount !== 1 ? 's' : ''}`
                    )}
                  </button>
                </div>
              )}

              {/* Submit button (visible when at least 1 video exists) */}
              {totalVideoCount > 0 && !isUploading && pendingCount === 0 && (
                <div className="mt-lg" style={{ marginTop: 'var(--space-lg)' }}>
                  <button
                    id="submit-for-processing-btn"
                    className="btn btn--primary btn--large w-full"
                    onClick={handleSubmit}
                    style={{ width: '100%' }}
                  >
                    ✅ Submit {totalVideoCount} Video{totalVideoCount !== 1 ? 's' : ''} for Processing
                  </button>
                </div>
              )}
            </>
          )}

          {/* Already uploaded videos */}
          {videos.length > 0 && (
            <div className="mt-xl" style={{ marginTop: 'var(--space-xl)' }}>
              <h3 className="mb-md" style={{ marginBottom: 'var(--space-md)' }}>
                Uploaded Videos ({videos.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {videos.map((v) => (
                  <div key={v.id} className="file-item">
                    <span className="file-item__icon">🎬</span>
                    <div className="file-item__info">
                      <div className="file-item__name">{v.original_name}</div>
                      <div className="file-item__meta">
                        {formatBytes(v.size_bytes)} · Uploaded {new Date(v.uploaded_at || v.created).toLocaleDateString()}
                      </div>
                    </div>
                    {!isLocked && (
                      <div className="file-item__actions">
                        <button className="file-item__remove" onClick={() => handleRemoveVideo(v.id)} title="Remove video">
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
