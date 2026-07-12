import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, User, LogOut } from 'lucide-react';
import { Command } from 'cmdk';
import './Header.css';

export default function Header() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [userName, setUserName] = useState('Guest');
  const [userRole, setUserRole] = useState('User');

  useEffect(() => {
    const storedName = localStorage.getItem('userName');
    const storedRole = localStorage.getItem('userRole');
    if (storedName) setUserName(storedName);
    if (storedRole) setUserRole(storedRole);
  }, []);

  // Toggle command menu
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    navigate('/login');
  };

  return (
    <header className="header">
      <div 
        className="header-search"
        onClick={() => setOpen(true)}
      >
        <Search size={16} />
        <span style={{ fontSize: '0.875rem' }}>Search vehicles, drivers...</span>
        <span className="header-shortcut">⌘K</span>
      </div>

      <div className="flex items-center gap-6">
        <button className="btn-outline flex items-center justify-center" style={{ padding: '0.4rem', borderRadius: '50%', border: 'none' }}>
          <Bell size={20} className="text-muted" />
        </button>
        <div className="flex items-center gap-2 cursor-pointer">
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--status-blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={16} />
          </div>
          <div className="header-profile-text">
            <span className="heading" style={{ fontSize: '0.875rem', lineHeight: '1.2' }}>{userName}</span>
            <span className="text-muted" style={{ fontSize: '0.75rem', lineHeight: '1.2' }}>{userRole}</span>
          </div>
        </div>
        <button className="btn-outline flex items-center justify-center" onClick={handleLogout} title="Log Out" style={{ padding: '0.4rem', border: 'none', background: 'transparent', cursor: 'pointer' }}>
          <LogOut size={20} className="text-muted" />
        </button>
      </div>

      {open && (
        <div className="command-palette-overlay" onClick={() => setOpen(false)}>
          <div className="command-palette" onClick={(e) => e.stopPropagation()}>
            <Command>
              <Command.Input placeholder="Type a command or search..." autoFocus />
              <Command.List>
                <Command.Empty>No results found.</Command.Empty>
                <Command.Group heading="Pages">
                  <Command.Item onSelect={() => { navigate('/'); setOpen(false); }}>Control Tower</Command.Item>
                  <Command.Item onSelect={() => { navigate('/vehicles'); setOpen(false); }}>Fleet Registry</Command.Item>
                  <Command.Item onSelect={() => { navigate('/drivers'); setOpen(false); }}>Drivers</Command.Item>
                </Command.Group>
                <Command.Group heading="Quick Actions">
                  <Command.Item>New Dispatch</Command.Item>
                  <Command.Item>Add Vehicle</Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </div>
        </div>
      )}
    </header>
  );
}
