import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import pb from '../../utils/pb';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (pb.authStore.isValid) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await pb.collection('users').authWithPassword(email, password);
      navigate('/admin/dashboard');
    } catch (e) {
      setError('Invalid credentials. Please try again.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="page">
        <div className="login-wrap">
          <div className="card card--elevated login-card">
            <div className="text-center mb-lg" style={{ marginBottom: 'var(--space-lg)' }}>
              <h2>
                <span className="text-gradient">Admin Login</span>
              </h2>
              <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: 'var(--space-xs)' }}>
                Sign in to manage submissions
              </p>
            </div>

            {error && <div className="banner banner--error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  className="input"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="form-group">
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <button
                id="login-submit-btn"
                className="btn btn--primary btn--large w-full"
                type="submit"
                disabled={loading}
                style={{ width: '100%', marginTop: 'var(--space-md)' }}
              >
                {loading ? (
                  <>
                    <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                    Signing in…
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}
