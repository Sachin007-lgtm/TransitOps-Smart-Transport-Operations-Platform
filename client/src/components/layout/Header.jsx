import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Bell, User, Settings, LogOut, ChevronRight, ShieldAlert, Wrench, FileWarning } from 'lucide-react';
import { Command } from 'cmdk';
import { useGlobalSearch } from '../../contexts/GlobalSearchContext';
import './Header.css';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [openCommand, setOpenCommand] = useState(false);
  const [openPopover, setOpenPopover] = useState(null); // 'bell' | 'user' | null
  const { globalSearch, setGlobalSearch } = useGlobalSearch();
  const isDispatching = location.pathname === '/trips';

  const [userName, setUserName] = useState('Guest');
  const [userRole, setUserRole] = useState('User');
  const [userEmail, setUserEmail] = useState('user@example.com');

  const bellRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    const storedName = localStorage.getItem('userName');
    const storedRole = localStorage.getItem('userRole');
    const storedEmail = localStorage.getItem('userEmail');
    if (storedName) setUserName(storedName);
    if (storedRole) setUserRole(storedRole);
    if (storedEmail) setUserEmail(storedEmail);
  }, []);

  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpenCommand((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        openPopover === 'bell' && 
        bellRef.current && 
        !bellRef.current.contains(e.target)
      ) {
        setOpenPopover(null);
      }
      if (
        openPopover === 'user' && 
        userRef.current && 
        !userRef.current.contains(e.target)
      ) {
        setOpenPopover(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openPopover]);

  const togglePopover = (type) => {
    setOpenPopover(prev => prev === type ? null : type);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    navigate('/login');
  };

  const handleUserAction = () => {
    const evt = new CustomEvent('app-toast', { detail: 'Placeholder action triggered' });
    window.dispatchEvent(evt);
    setOpenPopover(null);
  };

  // Extract initials for avatar
  const getInitials = (name) => {
    if (!name) return 'US';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <header className="header">
      <div className="header-search-container" style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '340px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--sub)' }} />
        <input 
          type="text" 
          placeholder="Search vehicles, drivers, trips..." 
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          style={{ 
            width: '100%', 
            padding: '0.5rem 2.5rem 0.5rem 2.5rem', 
            borderRadius: '6px', 
            border: '1px solid var(--line)', 
            background: 'var(--bg)',
            fontSize: '0.875rem'
          }}
        />
        <span className="header-shortcut" onClick={() => setOpenCommand(true)} style={{ position: 'absolute', right: '12px', cursor: 'pointer' }}>⌘K</span>
      </div>

      <div className="flex items-center gap-6">
        
        {/* Status Badge */}
        {isDispatching && (
          <div className="pill pill-blue fade-in" style={{ textTransform: 'none', gap: '0.35rem', padding: '0.25rem 0.6rem' }}>
            <span className="pulsing-dot" style={{ margin: 0 }}></span>
            Dispatching · RK
          </div>
        )}
        
        {/* Notifications */}
        <div className="relative" style={{ position: 'relative' }} ref={bellRef}>
          <button 
            className="btn-outline flex items-center justify-center" 
            style={{ position: 'relative', padding: '0.4rem', borderRadius: '50%', border: 'none', cursor: 'pointer' }}
            onClick={() => togglePopover('bell')}
          >
            <Bell size={20} className="text-muted" />
            <span style={{ position: 'absolute', top: '2px', right: '4px', width: '8px', height: '8px', background: 'var(--red)', borderRadius: '50%', border: '2px solid var(--card)' }}></span>
          </button>

          {openPopover === 'bell' && (
            <div className="popover-menu" style={{ width: '300px', right: '-1rem' }}>
              <div className="popover-header">
                <h3 style={{ fontSize: '0.875rem', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>Notifications</h3>
              </div>
              <div style={{ padding: '0.5rem 0' }}>
                <div className="popover-item" onClick={() => { navigate('/drivers'); setOpenPopover(null); }}>
                  <div style={{ color: 'var(--red)', marginTop: '2px' }}><FileWarning size={16} /></div>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>License Expiry</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Driver Priya's license expires in 3 days.</div>
                  </div>
                </div>
                <div className="popover-item" onClick={() => { navigate('/vehicles'); setOpenPopover(null); }}>
                  <div style={{ color: 'var(--orange)', marginTop: '2px' }}><ShieldAlert size={16} /></div>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Vehicle Locked</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MINI-03 is locked from dispatch.</div>
                  </div>
                </div>
                <div className="popover-item" onClick={() => { navigate('/maintenance'); setOpenPopover(null); }}>
                  <div style={{ color: 'var(--blue)', marginTop: '2px' }}><Wrench size={16} /></div>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Service Due</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>VAN-05 requires scheduled maintenance.</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Block */}
        <div className="relative" style={{ position: 'relative' }} ref={userRef}>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => togglePopover('user')}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#7c4fd6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 'bold' }}>
              {getInitials(userName)}
            </div>
            <div className="header-profile-text">
              <span className="heading" style={{ fontSize: '0.875rem', lineHeight: '1.2' }}>{userName}</span>
              <span className="text-muted" style={{ fontSize: '0.75rem', lineHeight: '1.2' }}>{userRole}</span>
            </div>
            <ChevronRight size={14} className="text-muted" style={{ transform: openPopover === 'user' ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.2s' }} />
          </div>

          {openPopover === 'user' && (
            <div className="popover-menu" style={{ width: '220px', right: 0 }}>
              <div className="popover-header">
                <div style={{ fontWeight: '500', fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '2px' }}>{userName}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{userEmail}</div>
                <div style={{ display: 'inline-block', backgroundColor: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '500' }}>{userRole}</div>
              </div>
              <div style={{ padding: '0.5rem 0' }}>
                <div className="popover-item" onClick={() => { navigate('/settings'); setOpenPopover(null); }}>
                  <User size={16} style={{ color: 'var(--text-muted)' }} /> View profile
                </div>
                <div className="popover-item" onClick={() => { navigate('/settings'); setOpenPopover(null); }}>
                  <Settings size={16} style={{ color: 'var(--text-muted)' }} /> Account settings
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--line)', padding: '0.5rem 0' }}>
                <div className="popover-item" style={{ color: 'var(--red)' }} onClick={handleLogout}>
                  <LogOut size={16} /> Sign out
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Command Palette Overlay */}
      {openCommand && (
        <div className="command-palette-overlay" onClick={() => setOpenCommand(false)}>
          <div className="command-palette" onClick={(e) => e.stopPropagation()}>
            <Command>
              <Command.Input placeholder="Type a command or search..." autoFocus />
              <Command.List>
                <Command.Empty>No results found.</Command.Empty>
                <Command.Group heading="Pages">
                  <Command.Item onSelect={() => { navigate('/'); setOpenCommand(false); }}>Control Tower</Command.Item>
                  <Command.Item onSelect={() => { navigate('/vehicles'); setOpenCommand(false); }}>Fleet Registry</Command.Item>
                  <Command.Item onSelect={() => { navigate('/drivers'); setOpenCommand(false); }}>Drivers</Command.Item>
                </Command.Group>
                <Command.Group heading="Quick Actions">
                  <Command.Item onSelect={() => { navigate('/'); setOpenCommand(false); }}>New Dispatch</Command.Item>
                  <Command.Item onSelect={() => { navigate('/vehicles'); setOpenCommand(false); }}>Add Vehicle</Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </div>
        </div>
      )}
    </header>
  );
}
