import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../../utils/api';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('fleet@transitops.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await apiRequest('POST', '/auth/login', { email, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('userRole', res.data.user.role);
      localStorage.setItem('userName', res.data.user.name);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container fade-in">
      {/* Left Panel - Branding */}
      <div className="login-left">
        <div className="login-branding">
          <div className="login-logo">T</div>
          <h1 className="heading" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>TransitOps</h1>
          <p className="text-muted" style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Smart Transport Operations Platform
          </p>
        </div>

        <div className="login-roles-section">
          <h3 className="heading" style={{ marginBottom: '1rem' }}>Pre-seeded Demo Logins:</h3>
          <ul className="login-roles-list" style={{ fontSize: '0.85rem', lineHeight: '1.6' }}>
            <li><strong>Fleet Manager:</strong> fleet@transitops.com</li>
            <li><strong>Driver:</strong> driver@transitops.com</li>
            <li><strong>Safety Officer:</strong> safety@transitops.com</li>
            <li><strong>Finance Analyst:</strong> finance@transitops.com</li>
            <li style={{ marginTop: '0.5rem', listStyle: 'none', color: 'var(--text-muted)' }}>Password for all: <em>password123</em></li>
          </ul>
        </div>
        
        <div className="login-footer text-muted text-xs">
          TRANSITOPS © 2026 · RBAC ENABLED
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="login-right">
        <div className="login-form-container">
          <h2 className="heading" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Sign in to your account</h2>
          <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '2rem' }}>Enter your credentials to continue</p>

          {error && <div className="error-message" style={{ color: 'var(--status-red)', marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</div>}

          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label>EMAIL</label>
              <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            <div className="input-group">
              <label>PASSWORD</label>
              <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>

            <div className="login-options">
              <label className="remember-me">
                <input type="checkbox" defaultChecked /> Remember me
              </label>
              <a href="#" className="forgot-password">Forgot password?</a>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', marginTop: '1rem' }}>
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <div className="login-access-notes text-muted text-xs">
            Access is scoped by role after login:<br/>
            • Fleet Manager → Fleet, Maintenance<br/>
            • Driver → Trips, Refueling logs<br/>
            • Safety Officer → Drivers, Compliance<br/>
            • Financial Analyst → Fuel & Expenses, Analytics
          </div>
        </div>
      </div>
    </div>
  );
}
