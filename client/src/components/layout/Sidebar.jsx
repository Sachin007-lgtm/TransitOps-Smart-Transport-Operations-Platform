import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, Truck, Users, Map, Wrench, Droplet, BarChart2, Settings, ChevronLeft, LogOut } from 'lucide-react';
import './Sidebar.css';

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);

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
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="logo-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="logo-svg">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
          </div>
          <span className="logo-text">TransitOps</span>
        </Link>
      </div>

      <nav className="sidebar-nav">
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

        <div className="nav-item" onClick={() => {
          localStorage.clear();
          window.location.href = '/login';
        }} style={{ marginTop: 'auto', marginBottom: '1rem', cursor: 'pointer', color: 'var(--red)' }}>
          <LogOut size={20} className="nav-icon" style={{ color: 'var(--red)' }} />
          <span className="nav-label">Sign Out</span>
        </div>
      </nav>
    </aside>
  );
}
