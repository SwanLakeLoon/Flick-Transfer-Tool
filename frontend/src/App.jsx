import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import DropUpload from './pages/DropUpload';
import AdminLogin from './pages/admin/Login';
import AdminDashboard from './pages/admin/Dashboard';
import AdminDropDetail from './pages/admin/DropDetail';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/drop/:token" element={<DropUpload />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/drop/:id" element={<AdminDropDetail />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
