import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import Drivers from './pages/Drivers';
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
  const [toast, setToast] = React.useState(null);

  React.useEffect(() => {
    const handleToast = (e) => {
      setToast({ message: e.detail, type: e.type || 'info', id: Date.now() });
      setTimeout(() => setToast(null), 2700);
    };
    window.addEventListener('app-toast', handleToast);
    return () => window.removeEventListener('app-toast', handleToast);
  }, []);

  if (!toast) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
      backgroundColor: toast.type === 'error' ? 'var(--red)' : '#2b2530',
      color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px',
      boxShadow: '0 4px 15px rgba(0,0,0,0.2)', zIndex: 9999,
      fontSize: '0.875rem', fontWeight: 500, animation: 'slideInRow 0.3s ease-out'
    }}>
      {toast.message}
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
                <Route path="drivers" element={<Drivers />} />
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
