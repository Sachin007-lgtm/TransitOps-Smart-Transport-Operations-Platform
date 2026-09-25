import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './LoginPage.css';

// Custom Hook for count up
function useCountUp(end, duration = 2000, startDelay = 0) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime;
    let animationFrame;
    let timeout;

    const updateCount = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      
      if (progress < duration) {
        setCount(Math.min(end, Math.floor((progress / duration) * end)));
        animationFrame = requestAnimationFrame(updateCount);
      } else {
        setCount(end);
      }
    };

    timeout = setTimeout(() => {
      animationFrame = requestAnimationFrame(updateCount);
    }, startDelay);

    return () => {
      clearTimeout(timeout);
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [end, duration, startDelay]);

  return count;
}

const taglines = [
  "Zero missed maintenance schedules.",
  "Dispatch smarter, not harder.",
  "Every driver, every license, always current.",
  "One dashboard. Your whole fleet."
];

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [taglineIdx, setTaglineIdx] = useState(0);
  const [fadeTagline, setFadeTagline] = useState(true);

  const vehiclesTracked = useCountUp(118, 1500, 0);
  const fleetUptime = useCountUp(99, 1500, 300);

  useEffect(() => {
    const interval = setInterval(() => {
      setFadeTagline(false);
      setTimeout(() => {
        setTaglineIdx((prev) => (prev + 1) % taglines.length);
        setFadeTagline(true);
      }, 500);
    }, 3200);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    const trimmed = identifier.trim();
    if (!trimmed || !password) {
      setError('Please enter your email or phone number and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(trimmed, password);
      const destination = location.state?.from?.pathname || '/';
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-container fade-in">
      {/* Left Panel - Branding */}
      <div className="login-left">
        <div className="login-branding">
          <div className="new-logo-badge">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h4l3-9 5 18 3-9h3" />
              <circle cx="21" cy="12" r="2" fill="var(--accent-primary)" />
            </svg>
          </div>
          <h1 className="heading" style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>TransitOps</h1>
          <p className="stat-label">
            Smart transport operations platform
          </p>
        </div>

        {/* Decorative Graphic */}
        <div className="decorative-route">
          <svg width="100%" height="80" viewBox="0 0 300 80">
            <path d="M 0 40 Q 75 0 150 40 T 300 40" className="route-path" />
            <path d="M 0 40 Q 75 0 150 40 T 300 40" className="route-path-active" />
            <circle cx="0" cy="40" r="4" fill="rgba(255,255,255,0.4)" />
            <circle cx="150" cy="40" r="4" fill="var(--accent-primary)" />
            <circle cx="300" cy="40" r="4" fill="rgba(255,255,255,0.4)" />
          </svg>
        </div>

        <div className="login-stats">
          <div className="stat-item">
            <span className="stat-value">{vehiclesTracked}</span>
            <span className="stat-label">Vehicles tracked</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{fleetUptime}.2%</span>
            <span className="stat-label">Fleet uptime</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ fontSize: '1.25rem', paddingTop: '0.5rem' }}>Real-time</span>
            <span className="stat-label">Dispatch sync</span>
          </div>
        </div>

        <div className="tagline-container">
          <div className="tagline-text" style={{ opacity: fadeTagline ? 1 : 0 }}>
            "{taglines[taglineIdx]}"
          </div>
        </div>
        
        <div className="login-footer text-xs font-mono">
          © 2026 TransitOps · Built for fleets that never stop moving
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="login-right">
        <div className="login-form-container">
          <h2 className="heading" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Command your fleet.</h2>
          <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '2.5rem', lineHeight: '1.5' }}>
            Sign in to dispatch, track, and manage every vehicle in one place.
          </p>

          {error && (
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#ff8080',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              fontSize: '0.875rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label>EMAIL OR PHONE NUMBER</label>
              <input 
                type="text" 
                className="login-input" 
                value={identifier} 
                onChange={e => setIdentifier(e.target.value)} 
                required 
                placeholder="name@company.com or phone"
                autoComplete="username"
                disabled={isSubmitting}
              />
            </div>

            <div className="input-group" style={{ position: 'relative' }}>
              <label>PASSWORD</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type={showPassword ? "text" : "password"} 
                  className="login-input" 
                  style={{ paddingRight: '2.5rem' }} 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
              </div>
            </div>

            <div className="login-options">
              <label className="custom-checkbox-wrapper">
                <input type="checkbox" className="custom-checkbox" defaultChecked /> Remember me
              </label>
            </div>

            <button type="submit" className="btn-amber" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <div className="spinner"></div>
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
