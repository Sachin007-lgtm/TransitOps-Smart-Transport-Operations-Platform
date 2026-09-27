import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import VehicleProfile from './pages/VehicleProfile';
import Drivers from './pages/Drivers';
import DriverProfile from './pages/DriverProfile';
import LoginPage from './pages/auth/LoginPage';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute, PublicOnlyRoute, PlatformAdminRoute, TenantManagerRoute } from './components/auth/ProtectedRoute';
import { GlobalSearchProvider } from './contexts/GlobalSearchContext';
import PlatformAdmin from './pages/PlatformAdmin';

import TripDispatcher from './pages/TripDispatcher';
import LiveMap from './pages/LiveMap';
import Billing from './pages/Billing';
import Maintenance from './pages/Maintenance';
import FuelExpenses from './pages/FuelExpenses';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return <div style={{ padding: '2rem', color: 'red' }}>
        <h1>Something went wrong.</h1>
        <pre>{this.state.error?.stack}</pre>
      </div>;
    }
    return this.props.children;
  }
}

function GlobalToast() {
  const [toasts, setToasts] = React.useState([]);

  React.useEffect(() => {
    const addToast = (message, type = 'success') => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { message: String(message), type, id }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    };

    // Expose a global helper for clean usage: window.showToast('msg', 'error')
    window.showToast = addToast;

    const handleToast = (e) => {
      const raw = e.detail;
      if (raw && typeof raw === 'object') {
        // { message, type } object pattern
        addToast(raw.message || raw.detail || JSON.stringify(raw), raw.toastType || raw.type || 'success');
      } else {
        // plain string — always success unless we can infer from text
        addToast(raw, 'success');
      }
    };

    window.addEventListener('app-toast', handleToast);
    return () => {
      window.removeEventListener('app-toast', handleToast);
      delete window.showToast;
    };
  }, []);

  if (toasts.length === 0) return null;

  const styles = {
    error:   { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c', icon: '✕' },
    success: { bg: '#f0fdf4', border: '#86efac', text: '#15803d', icon: '✓' },
    info:    { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8', icon: 'ℹ' },
    warning: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', icon: '⚠' },
  };

  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
      zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '0.5rem',
      alignItems: 'center', pointerEvents: 'none'
    }}>
      {toasts.map(toast => {
        const c = styles[toast.type] || styles.success;
        return (
          <div key={toast.id} style={{
            backgroundColor: c.bg, border: `1px solid ${c.border}`, color: c.text,
            padding: '0.55rem 1.1rem', borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            fontSize: '0.85rem', fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            animation: 'slideInRow 0.25s ease-out',
            pointerEvents: 'auto', whiteSpace: 'nowrap',
            maxWidth: '480px', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            <span style={{ fontWeight: 700 }}>{c.icon}</span>
            {toast.message}
          </div>
        );
      })}
    </div>
  );
}


function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <GlobalSearchProvider>
          <GlobalToast />
          <Routes>
            <Route 
              path="/login" 
              element={
                <PublicOnlyRoute>
                  <LoginPage />
                </PublicOnlyRoute>
              } 
            />
            {/* Platform Superadmin Route */}
            <Route element={<PlatformAdminRoute />}>
              <Route path="/admin" element={<AppLayout />}>
                <Route index element={<PlatformAdmin />} />
              </Route>
            </Route>

            {/* Tenant Fleet Manager Routes */}
            <Route element={<TenantManagerRoute />}>
              <Route path="/" element={<AppLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="vehicles" element={<Vehicles />} />
                <Route path="vehicles/:id" element={<VehicleProfile />} />
                <Route path="drivers" element={<Drivers />} />
                <Route path="drivers/:id" element={<DriverProfile />} />
                <Route path="trips" element={<TripDispatcher />} />
                <Route path="live-map" element={<LiveMap />} />
                <Route path="billing" element={<Billing />} />
                <Route path="maintenance" element={<Maintenance />} />
                <Route path="fuel" element={<FuelExpenses />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </GlobalSearchProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
