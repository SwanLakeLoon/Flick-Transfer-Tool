import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import pb from '../../utils/pb';

const STATUS_ORDER = ['submitted', 'processing', 'completed'];
const STATUS_LABELS = {
  submitted: 'Submitted',
  processing: 'Processing',
  completed: 'Completed',
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [drops, setDrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedDrops, setSelectedDrops] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);

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
        filter: 'status != "awaiting_uploads"',
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

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedDrops(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (e, currentList) => {
    e.stopPropagation();
    const allIds = currentList.map(d => d.id);
    const areAllSelected = allIds.length > 0 && allIds.every(id => selectedDrops.includes(id));
    if (areAllSelected) {
      setSelectedDrops(prev => prev.filter(id => !allIds.includes(id)));
    } else {
      const newSelections = new Set([...selectedDrops, ...allIds]);
      setSelectedDrops(Array.from(newSelections));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDrops.length === 0) return;
    if (!confirm(`WARNING: Are you absolutely sure you want to permanently delete ${selectedDrops.length} drops and ALL associated videos? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      for (const dropId of selectedDrops) {
        const vids = await pb.collection('videos').getFullList({ filter: `drop="${dropId}"` });
        for (const v of vids) {
          await pb.collection('videos').delete(v.id);
        }
        await pb.collection('drops').delete(dropId);
      }
      setSelectedDrops([]);
      await fetchDrops();
    } catch (e) {
      alert('Error during bulk deletion: ' + e.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredDrops = filter === 'all' ? drops : drops.filter(d => d.status === filter);

  const counts = {
    all: drops.length,
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
            {['submitted', 'processing', 'completed'].map(status => (
              <div key={status} className="card stat-card" onClick={() => setFilter(status)} style={{ cursor: 'pointer' }}>
                <div className="stat-card__value" style={{
                  color: status === 'submitted' ? 'var(--status-submitted)' :
                         status === 'processing' ? 'var(--status-processing)' :
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

          {/* Bulk Actions Banner */}
          {selectedDrops.length > 0 && (
            <div className="banner banner--error flex items-center justify-between mb-lg" style={{ animation: 'fadeIn 0.2s ease-out', padding: '12px 16px', background: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
              <div>
                <strong style={{ color: '#fca5a5' }}>{selectedDrops.length} drop{selectedDrops.length !== 1 ? 's' : ''} selected</strong>
              </div>
              <button 
                className="btn btn--danger" 
                onClick={handleBulkDelete}
                disabled={isDeleting}
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
              >
                {isDeleting ? 'Deleting...' : '🗑 Delete Selected'}
              </button>
            </div>
          )}

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
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        onChange={(e) => toggleSelectAll(e, filteredDrops)}
                        checked={filteredDrops.length > 0 && filteredDrops.every(d => selectedDrops.includes(d.id))}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
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
                      style={{ background: selectedDrops.includes(drop.id) ? 'rgba(239, 68, 68, 0.08)' : '' }}
                    >
                      <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedDrops.includes(drop.id)}
                          onChange={(e) => toggleSelect(drop.id, e)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
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
