import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, ChevronDown, Shield, Truck, BarChart3, Users, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import './LoginPage.css';

const rolesData = [
  { id: 1, title: 'Fleet Manager',      desc: 'Full access',       icon: Truck },
  { id: 2, title: 'Driver',             desc: 'Trips + Refueling', icon: Users },
  { id: 3, title: 'Safety Officer',     desc: 'Compliance',        icon: Shield },
  { id: 4, title: 'Financial Analyst',  desc: 'Reports only',      icon: BarChart3 },
];

function PasswordStrength({ password }) {
  const checks = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'One uppercase letter',  ok: /[A-Z]/.test(password) },
    { label: 'One number',            ok: /\d/.test(password) },
  ];
  if (!password) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.4rem' }}>
      {checks.map((c) => (
        <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem',
          color: c.ok ? 'var(--status-green, #4ade80)' : 'var(--text-muted)' }}>
          <CheckCircle2 size={12} style={{ opacity: c.ok ? 1 : 0.35 }} />
          {c.label}
        </div>
      ))}
    </div>
  );
}

export default function SignupPage() {
  const navigate = useNavigate();
  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirmPw, setConfirmPw]     = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [role, setRole]               = useState(rolesData[0]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [error, setError]             = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPw) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiRequest('POST', '/auth/register', {
        name,
        email,
        password,
        role_id: role.id,
      });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('userRole', res.data.user.role || role.title);
      localStorage.setItem('userName', res.data.user.name);
      if (res.data.user.email) {
        localStorage.setItem('userEmail', res.data.user.email);
      }
      navigate('/');
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container fade-in">
      {/* Left Panel – Branding (reuses existing CSS) */}
      <div className="login-left">
        <div className="login-branding">
          <div className="new-logo-badge">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h4l3-9 5 18 3-9h3" />
              <circle cx="21" cy="12" r="2" fill="var(--accent-primary)" />
            </svg>
          </div>
          <h1 className="heading" style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>TransitOps</h1>
          <p className="stat-label">Smart transport operations platform</p>
        </div>

        <div className="decorative-route">
          <svg width="100%" height="80" viewBox="0 0 300 80">
            <path d="M 0 40 Q 75 0 150 40 T 300 40" className="route-path" />
            <path d="M 0 40 Q 75 0 150 40 T 300 40" className="route-path-active" />
            <circle cx="0"   cy="40" r="4" fill="rgba(255,255,255,0.4)" />
            <circle cx="150" cy="40" r="4" fill="var(--accent-primary)" />
            <circle cx="300" cy="40" r="4" fill="rgba(255,255,255,0.4)" />
          </svg>
        </div>

        <div className="login-stats">
          <div className="stat-item">
            <span className="stat-value">118</span>
            <span className="stat-label">Vehicles tracked</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">99.2%</span>
            <span className="stat-label">Fleet uptime</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ fontSize: '1.25rem', paddingTop: '0.5rem' }}>Real-time</span>
            <span className="stat-label">Dispatch sync</span>
          </div>
        </div>

        <div className="login-footer text-xs font-mono">
          © 2026 TransitOps · Built for fleets that never stop moving
        </div>
      </div>

      {/* Right Panel – Signup Form */}
      <div className="login-right">
        <div className="login-form-container">
          <h2 className="heading" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Join TransitOps.</h2>
          <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '2.5rem', lineHeight: '1.5' }}>
            Create your account and start managing your fleet in minutes.
          </p>

          {error && (
            <div className="error-message"
              style={{ color: 'var(--status-red)', marginBottom: '1rem', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            {/* Full Name */}
            <div className="input-group">
              <label>FULL NAME</label>
              <input
                type="text"
                id="signup-name"
                className="login-input"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="John Doe"
              />
            </div>

            {/* Email */}
            <div className="input-group">
              <label>EMAIL</label>
              <input
                type="email"
                id="signup-email"
                className="login-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="name@company.com"
              />
            </div>

            {/* Role */}
            <div className="input-group" style={{ position: 'relative' }} ref={dropdownRef}>
              <label>ROLE</label>
              <div className="custom-select-container">
                <div
                  id="signup-role-trigger"
                  className={`custom-select-trigger ${isDropdownOpen ? 'open' : ''}`}
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <div className="flex items-center gap-2">
                    <role.icon size={18} className="text-muted" />
                    <span className="font-medium text-sm">{role.title}</span>
                  </div>
                  <ChevronDown size={18} className="chevron" />
                </div>

                {isDropdownOpen && (
                  <div className="custom-select-dropdown">
                    {rolesData.map((r) => (
                      <div
                        key={r.id}
                        className="custom-select-option"
                        onClick={() => { setRole(r); setIsDropdownOpen(false); }}
                      >
                        <r.icon size={20} className="icon" />
                        <div>
                          <span className="title">{r.title}</span>
                          <span className="desc">{r.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Password */}
            <div className="input-group" style={{ position: 'relative' }}>
              <label>PASSWORD</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="signup-password"
                  className="login-input"
                  style={{ paddingRight: '2.5rem' }}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '0.75rem', background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            {/* Confirm Password */}
            <div className="input-group" style={{ position: 'relative' }}>
              <label>CONFIRM PASSWORD</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  id="signup-confirm-password"
                  className="login-input"
                  style={{ paddingRight: '2.5rem',
                    borderColor: confirmPw && confirmPw !== password ? 'var(--status-red)' : undefined }}
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  required
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  style={{ position: 'absolute', right: '0.75rem', background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  {showConfirm ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-amber" disabled={isLoading} id="signup-submit">
              {isLoading ? (
                <>
                  <div className="spinner" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--accent-primary)', fontWeight: 600, textDecoration: 'none' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
