import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import pb from '../../utils/pb';

const STATUS_ORDER = ['submitted', 'processing', 'awaiting_uploads', 'completed'];
const STATUS_LABELS = {
  awaiting_uploads: 'Awaiting Uploads',
  submitted: 'Submitted',
  processing: 'Processing',
  completed: 'Completed',
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [drops, setDrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!pb.authStore.isValid) {
      navigate('/admin', { replace: true });
      return;
    }
    fetchDrops();
  }, [navigate]);

  const fetchDrops = async () => {
    try {
      const records = await pb.collection('drops').getFullList({
        sort: '-created',
      });
      setDrops(records);
    } catch (e) {
      console.error('Failed to load drops:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    pb.authStore.clear();
    navigate('/admin');
  };

  const filteredDrops = filter === 'all' ? drops : drops.filter(d => d.status === filter);

  const counts = {
    all: drops.length,
    awaiting_uploads: drops.filter(d => d.status === 'awaiting_uploads').length,
    submitted: drops.filter(d => d.status === 'submitted').length,
    processing: drops.filter(d => d.status === 'processing').length,
    completed: drops.filter(d => d.status === 'completed').length,
  };

  return (
    <>
      <Navbar admin />
      <main className="page">
        <div className="container">
          <div className="flex items-center justify-between mb-lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
            <h1><span className="text-gradient">Dashboard</span></h1>
            <button className="btn btn--secondary" onClick={handleLogout} style={{ fontSize: '0.8rem' }}>
              Sign Out
            </button>
          </div>

          {/* Stat cards */}
          <div className="stat-grid">
            {['submitted', 'processing', 'awaiting_uploads', 'completed'].map(status => (
              <div key={status} className="card stat-card" onClick={() => setFilter(status)} style={{ cursor: 'pointer' }}>
                <div className="stat-card__value" style={{
                  color: status === 'submitted' ? 'var(--status-submitted)' :
                         status === 'processing' ? 'var(--status-processing)' :
                         status === 'awaiting_uploads' ? 'var(--status-awaiting)' :
                         'var(--status-completed)'
                }}>
                  {counts[status]}
                </div>
                <div className="stat-card__label">{STATUS_LABELS[status]}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-sm mb-lg" style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)', overflowX: 'auto' }}>
            {['all', ...STATUS_ORDER].map(s => (
              <button
                key={s}
                className={`btn ${filter === s ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => setFilter(s)}
                style={{ fontSize: '0.8rem', padding: '6px 14px' }}
              >
                {s === 'all' ? `All (${counts.all})` : `${STATUS_LABELS[s]} (${counts[s]})`}
              </button>
            ))}
          </div>

          {/* Table */}
          {loading ? (
            <div className="text-center" style={{ padding: 'var(--space-3xl)' }}>
              <div className="spinner spinner--large" style={{ margin: '0 auto' }} />
            </div>
          ) : filteredDrops.length === 0 ? (
            <div className="card text-center" style={{ padding: 'var(--space-2xl)' }}>
              <p className="text-muted">No drops found.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Uploader</th>
                    <th>Status</th>
                    <th>Videos</th>
                    <th>Created</th>
                    <th>Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrops.map(drop => (
                    <tr
                      key={drop.id}
                      className="table__row--clickable"
                      onClick={() => navigate(`/admin/drop/${drop.id}`)}
                    >
                      <td>
                        <code style={{ color: 'var(--text-accent)', fontSize: '0.8rem' }}>
                          {drop.token?.substring(0, 12)}…
                        </code>
                      </td>
                      <td style={{ color: drop.uploader_name ? 'var(--text-main)' : 'var(--text-muted)' }}>
                        {drop.uploader_name || 'Anonymous'}
                      </td>
                      <td>
                        <span className={`badge badge--${drop.status}`}>
                          <span className="badge__dot" />
                          {drop.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td>{drop.video_count || 0}</td>
                      <td>{new Date(drop.created).toLocaleDateString()}</td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {drop.expires_at ? new Date(drop.expires_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
