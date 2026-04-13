import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home';
import DropUpload from './pages/DropUpload';
import AdminLogin from './pages/admin/Login';
import AdminDashboard from './pages/admin/Dashboard';
import AdminDropDetail from './pages/admin/DropDetail';
import Navbar from './components/Navbar';
import './index.css';

function NotFound() {
  return (
    <>
      <Navbar />
      <main className="page">
        <div className="container container--narrow text-center">
          <div className="status-hero">
            <div className="status-hero__icon">🔍</div>
            <h2>Page Not Found</h2>
            <p className="text-muted mt-md">
              The page you're looking for doesn't exist or has been moved.
            </p>
            <Link to="/" className="btn btn--primary mt-lg" style={{ marginTop: 'var(--space-lg)' }}>
              ← Back to Home
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/drop/:token" element={<DropUpload />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/drop/:id" element={<AdminDropDetail />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
