import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, Truck, Users, Map, Wrench, Droplet, BarChart2, Settings, ChevronLeft } from 'lucide-react';
import './Sidebar.css';

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Collapse Toggle */}
      <button 
        className="collapse-toggle" 
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <ChevronLeft size={16} className={isCollapsed ? 'rotate-180' : ''} />
      </button>

      <Link to="/" className="sidebar-header" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', padding: '1.25rem 1.5rem', marginBottom: '1rem', boxSizing: 'border-box' }}>
        <div className="brand-badge">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h4l3-9 5 18 3-9h3" />
            <circle cx="21" cy="12" r="2" fill="var(--accent-primary)" />
          </svg>
        </div>
        <span className="brand-text heading text-white tracking-wide">TransitOps</span>
      </Link>

      <nav className="sidebar-nav">
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
          <LayoutDashboard size={20} />
          <span className="nav-label">Dashboard</span>
        </NavLink>
        <NavLink to="/vehicles" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Truck size={20} />
          <span className="nav-label">Fleet</span>
        </NavLink>
        <NavLink to="/drivers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Users size={20} />
          <span className="nav-label">Drivers</span>
        </NavLink>
        <NavLink to="/trips" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Map size={20} />
          <span className="nav-label">Trips</span>
        </NavLink>
        <NavLink to="/maintenance" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Wrench size={20} />
          <span className="nav-label">Maintenance</span>
        </NavLink>
        <NavLink to="/fuel" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Droplet size={20} />
          <span className="nav-label">Fuel & expenses</span>
        </NavLink>
        <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <BarChart2 size={20} />
          <span className="nav-label">Analytics</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Settings size={20} />
          <span className="nav-label">Settings</span>
        </NavLink>
      </nav>
    </aside>
  );
}
