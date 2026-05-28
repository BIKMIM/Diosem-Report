import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Home from './pages/Home';
import ScheduleInput from './pages/ScheduleInput';
import ReportForm from './pages/ReportForm';
import ReportView from './pages/ReportView';
import AllReports from './pages/AllReports';
import PayrollView from './pages/PayrollView';
import AdminPanel from './pages/AdminPanel';
import './styles/global.css';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/schedule" element={<ProtectedRoute><ScheduleInput /></ProtectedRoute>} />
          <Route path="/report/:jobId" element={<ProtectedRoute><ReportForm /></ProtectedRoute>} />
          <Route path="/report-view/:reportId" element={<ProtectedRoute><ReportView /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><AllReports /></ProtectedRoute>} />
          <Route path="/payroll" element={<ProtectedRoute><PayrollView /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
