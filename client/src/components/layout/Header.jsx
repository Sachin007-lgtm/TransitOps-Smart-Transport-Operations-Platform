import React, { useState, useEffect } from 'react';
import { Search, Bell, User } from 'lucide-react';
import { Command } from 'cmdk';
import './Header.css'; // We'll inject some minimal CSS for cmdk

export default function Header() {
  const [open, setOpen] = useState(false);

  // Toggle the menu when ⌘K is pressed
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
            <span className="heading" style={{ fontSize: '0.875rem', lineHeight: '1.2' }}>Raven K.</span>
            <span className="text-muted" style={{ fontSize: '0.75rem', lineHeight: '1.2' }}>Dispatcher</span>
          </div>
        </div>
      </div>

      {open && (
        <div className="command-palette-overlay" onClick={() => setOpen(false)}>
          <div className="command-palette" onClick={(e) => e.stopPropagation()}>
            <Command>
              <Command.Input placeholder="Type a command or search..." autoFocus />
              <Command.List>
                <Command.Empty>No results found.</Command.Empty>
                <Command.Group heading="Pages">
                  <Command.Item onSelect={() => { window.location.href='/'; setOpen(false); }}>Control Tower</Command.Item>
                  <Command.Item onSelect={() => { window.location.href='/vehicles'; setOpen(false); }}>Fleet Registry</Command.Item>
                  <Command.Item onSelect={() => { window.location.href='/drivers'; setOpen(false); }}>Drivers</Command.Item>
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
