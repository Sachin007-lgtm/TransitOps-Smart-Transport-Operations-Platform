import React, { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Truck, 
  Users, 
  Map, 
  Radio, 
  Wrench, 
  Droplet, 
  BarChart2, 
  Settings, 
  ChevronLeft, 
  LogOut,
  Building2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './Sidebar.css';

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const isPlatformAdmin = user?.role === 'Platform Admin';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleUnimplemented = (e, name) => {
    e.preventDefault();
    const evt = new CustomEvent('app-toast', { detail: `Would navigate to ${name}...` });
    window.dispatchEvent(evt);
  };

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Collapse Toggle */}
      <button 
        className="collapse-toggle" 
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <ChevronLeft size={16} className={isCollapsed ? 'rotate-180' : ''} />
      </button>

      <div className="sidebar-header">
        <Link to={isPlatformAdmin ? "/admin" : "/"} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="logo-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="logo-svg">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
          </div>
          <span className="logo-text">TransitOps</span>
        </Link>
      </div>

      <nav className="sidebar-nav">
        {isPlatformAdmin ? (
          <>
            <div style={{ padding: '0.5rem 1rem 0.25rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Platform Superadmin
            </div>
            <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
              <Building2 size={20} className="nav-icon" />
              <span className="nav-label">Organizations</span>
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
              <LayoutDashboard size={20} className="nav-icon" />
              <span className="nav-label">Dashboard</span>
            </NavLink>
            
            <NavLink to="/vehicles" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Truck size={20} className="nav-icon" />
              <span className="nav-label">Fleet</span>
            </NavLink>

            <NavLink to="/drivers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Users size={20} className="nav-icon" />
              <span className="nav-label">Drivers</span>
            </NavLink>

            <NavLink to="/trips" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Map size={20} className="nav-icon" />
              <span className="nav-label">Trips</span>
            </NavLink>

            <NavLink to="/live-map" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Radio size={20} className="nav-icon" />
              <span className="nav-label">Live Fleet</span>
            </NavLink>

            <NavLink to="/maintenance" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Wrench size={20} className="nav-icon" />
              <span className="nav-label">Maintenance</span>
            </NavLink>

            <NavLink to="/fuel" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Droplet size={20} className="nav-icon" />
              <span className="nav-label">Fuel & expenses</span>
            </NavLink>

            <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <BarChart2 size={20} className="nav-icon" />
              <span className="nav-label">Analytics</span>
            </NavLink>

            <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Settings size={20} className="nav-icon" />
              <span className="nav-label">Settings</span>
            </NavLink>
          </>
        )}
        

        <div style={{ marginTop: 'auto' }}>
          <button 
            className="nav-item" 
            onClick={handleLogout}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: '#ff6b6b' }}
          >
            <LogOut size={20} className="nav-icon" />
            <span className="nav-label">Log Out</span>
          </button>
        </div>
      </nav>
    </aside>
  );
}
