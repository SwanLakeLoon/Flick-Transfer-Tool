import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import Navbar from '../components/Navbar';
import pb from '../utils/pb';

export default function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleStartDrop = async () => {
    setLoading(true);
    try {
      // Generate 64-char crypto random hex token
      const tokenBytes = new Uint8Array(32);
      crypto.getRandomValues(tokenBytes);
      const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');

      await pb.collection('drops').create({
        token,
        status: 'awaiting_uploads',
        video_count: 0,
      });

      navigate(`/drop/${token}`);
    } catch (e) {
      console.error('Failed to create drop:', e);
      alert('Failed to start submission. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="page">
        <div className="container container--narrow">
          <section className="hero">
            <h1 className="hero__title">
              <span className="text-gradient">Flick</span> File Transfer
            </h1>
            <p className="hero__subtitle">
              Securely upload video batches for processing. Get your results back via a private, anonymous link.
            </p>
            <button
              id="start-submission-btn"
              className="btn btn--primary btn--large"
              onClick={handleStartDrop}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                  Creating…
                </>
              ) : (
                '⚡ Start New Submission'
              )}
            </button>
          </section>

          <div className="features">
            <div className="card feature">
              <div className="feature__icon">🔒</div>
              <div className="feature__title">Anonymous & Private</div>
              <div className="feature__desc">
                No account needed. Your unique link is your key — only you can see your uploads and results.
              </div>
            </div>
            <div className="card feature">
              <div className="feature__icon">📹</div>
              <div className="feature__title">Built for Video</div>
              <div className="feature__desc">
                Upload dozens of video chunks at once. Resumable, fast, and reliable with S3-backed storage.
              </div>
            </div>
            <div className="card feature">
              <div className="feature__icon">📊</div>
              <div className="feature__title">Get Results Back</div>
              <div className="feature__desc">
                Once your videos are processed, return to your link to download the completed CSV analysis.
              </div>
            </div>
          </div>

          <div className="card mt-xl" style={{ textAlign: 'center' }}>
            <h3 style={{ marginBottom: 'var(--space-sm)' }}>Already have a link?</h3>
            <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: 'var(--space-md)' }}>
              Paste your drop link in the address bar to return to your submission.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
