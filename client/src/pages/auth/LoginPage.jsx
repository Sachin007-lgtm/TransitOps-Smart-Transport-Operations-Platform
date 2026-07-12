import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState('Dispatcher');
  const [email, setEmail] = useState('raven.k@transitops.in');
  const [password, setPassword] = useState('password');

  const handleLogin = (e) => {
    e.preventDefault();
    localStorage.setItem('userRole', role);
    navigate('/');
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
          <h3 className="heading" style={{ marginBottom: '1rem' }}>One login, four roles:</h3>
          <ul className="login-roles-list">
            <li><span className="role-dot"></span> Fleet Manager</li>
            <li><span className="role-dot"></span> Dispatcher</li>
            <li><span className="role-dot"></span> Safety Officer</li>
            <li><span className="role-dot"></span> Financial Analyst</li>
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

          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label>EMAIL</label>
              <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            <div className="input-group">
              <label>PASSWORD</label>
              <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>

            <div className="input-group">
              <label>ROLE (RBAC DEMO)</label>
              <select className="select" value={role} onChange={e => setRole(e.target.value)}>
                <option>Fleet Manager</option>
                <option>Dispatcher</option>
                <option>Safety Officer</option>
                <option>Financial Analyst</option>
              </select>
            </div>

            <div className="login-options">
              <label className="remember-me">
                <input type="checkbox" defaultChecked /> Remember me
              </label>
              <a href="#" className="forgot-password">Forgot password?</a>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', marginTop: '1rem' }}>
              Sign In
            </button>
          </form>

          <div className="login-access-notes text-muted text-xs">
            Access is scoped by role after login:<br/>
            • Fleet Manager → Fleet, Maintenance<br/>
            • Dispatcher → Dashboard, Trips<br/>
            • Safety Officer → Drivers, Compliance<br/>
            • Financial Analyst → Fuel & Expenses, Analytics
          </div>
        </div>
      </div>
    </div>
  );
}
