import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import Drivers from './pages/Drivers';
import LoginPage from './pages/auth/LoginPage';
import { GlobalSearchProvider } from './contexts/GlobalSearchContext';

import TripDispatcher from './pages/TripDispatcher';
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

// Every in-app route needs a session. Without this guard a signed-out visitor
// renders the app shell, every page's API call answers 401, and the 401 handler
// bounces them to the login screen — which is why navigating between pages felt
// like being logged out. Sending them to /login directly also lets the login
// screen hand back the page they asked for.
function RequireAuth({ children }) {
  const location = useLocation();

  if (!localStorage.getItem('token')) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function App() {
  return (
    <ErrorBoundary>
      <GlobalSearchProvider>
        <GlobalToast />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="vehicles" element={<Vehicles />} />
            <Route path="drivers" element={<Drivers />} />
            <Route path="trips" element={<TripDispatcher />} />
            <Route path="billing" element={<Billing />} />
            <Route path="maintenance" element={<Maintenance />} />
            <Route path="fuel" element={<FuelExpenses />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </GlobalSearchProvider>
    </ErrorBoundary>
  );
}

export default App;
