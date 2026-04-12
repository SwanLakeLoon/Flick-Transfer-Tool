import { Link } from 'react-router-dom';

export default function Navbar({ admin }) {
  return (
    <nav className="navbar">
      <div className="container navbar__inner">
        <Link to={admin ? '/admin/dashboard' : '/'} className="navbar__brand">
          <span className="navbar__brand-icon">⚡</span>
          <span className="text-gradient">Flick</span>
        </Link>
        <div className="navbar__links">
          {admin ? (
            <Link to="/" className="btn btn--secondary" style={{ fontSize: '0.8rem', padding: '6px 14px' }}>
              Public Site
            </Link>
          ) : (
            <Link to="/admin" className="btn btn--secondary" style={{ fontSize: '0.8rem', padding: '6px 14px' }}>
              Admin
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
