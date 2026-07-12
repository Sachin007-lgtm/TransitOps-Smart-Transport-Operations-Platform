import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, User, Settings, LogOut, ChevronRight, ShieldAlert, Wrench, FileWarning } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Command } from 'cmdk';
import { useGlobalSearch } from '../../contexts/GlobalSearchContext';
import './Header.css';

export default function Header() {
  const [openCommand, setOpenCommand] = useState(false);
  const [openPopover, setOpenPopover] = useState(null); // 'bell' | 'user' | null
  const { globalSearch, setGlobalSearch } = useGlobalSearch();
  const location = useLocation();
  const isDispatching = location.pathname === '/trips';

  const bellRef = useRef(null);
  const userRef = useRef(null);

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

  const handleUserAction = () => {
    const evt = new CustomEvent('app-toast', { detail: 'Placeholder action triggered' });
    window.dispatchEvent(evt);
    setOpenPopover(null);
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
        <div className="relative" ref={bellRef}>
          <button 
            className="btn-outline flex items-center justify-center relative" 
            style={{ padding: '0.4rem', borderRadius: '50%', border: 'none', cursor: 'pointer' }}
            onClick={() => togglePopover('bell')}
          >
            <Bell size={20} className="text-muted" />
            {/* Unread Dot */}
            <span style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', background: 'var(--red)', borderRadius: '50%', border: '2px solid var(--card)' }}></span>
          </button>

          {openPopover === 'bell' && (
            <div className="popover-menu" style={{ width: '300px', right: '-1rem' }}>
              <div className="px-4 py-3 border-b border-[var(--line)]">
                <h3 className="heading text-sm">Notifications</h3>
              </div>
              <div className="flex flex-col">
                <div className="popover-item flex gap-3 p-3">
                  <div className="text-status-red mt-1"><FileWarning size={16} /></div>
                  <div>
                    <div className="text-sm font-medium">License Expiry</div>
                    <div className="text-xs text-muted">Driver Priya's license expires in 3 days.</div>
                  </div>
                </div>
                <div className="popover-item flex gap-3 p-3">
                  <div className="text-status-orange mt-1"><ShieldAlert size={16} /></div>
                  <div>
                    <div className="text-sm font-medium">Vehicle Locked</div>
                    <div className="text-xs text-muted">MINI-03 is locked from dispatch.</div>
                  </div>
                </div>
                <div className="popover-item flex gap-3 p-3">
                  <div className="text-status-blue mt-1"><Wrench size={16} /></div>
                  <div>
                    <div className="text-sm font-medium">Service Due</div>
                    <div className="text-xs text-muted">VAN-05 requires scheduled maintenance.</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Block */}
        <div className="relative" ref={userRef}>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => togglePopover('user')}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#7c4fd6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 'bold' }}>
              RK
            </div>
            <div className="header-profile-text">
              <span className="heading" style={{ fontSize: '0.875rem', lineHeight: '1.2' }}>Raven K.</span>
              <span className="text-muted" style={{ fontSize: '0.75rem', lineHeight: '1.2' }}>Dispatcher</span>
            </div>
            <ChevronRight size={14} className="text-muted" style={{ transform: openPopover === 'user' ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.2s' }} />
          </div>

          {openPopover === 'user' && (
            <div className="popover-menu" style={{ width: '220px', right: 0 }}>
              <div className="px-4 py-3 border-b border-[var(--line)]">
                <div className="text-sm font-medium">Raven K.</div>
                <div className="text-xs text-muted">raven@transitops.com</div>
              </div>
              <div className="py-1">
                <div className="popover-item px-4 py-2 text-sm flex items-center gap-2" onClick={handleUserAction}>
                  <User size={16} className="text-muted" /> View profile
                </div>
                <div className="popover-item px-4 py-2 text-sm flex items-center gap-2" onClick={handleUserAction}>
                  <Settings size={16} className="text-muted" /> Account settings
                </div>
                <div className="popover-item px-4 py-2 text-sm flex items-center gap-2" onClick={handleUserAction}>
                  <ShieldAlert size={16} className="text-muted" /> Switch role
                </div>
              </div>
              <div className="border-t border-[var(--line)] py-1">
                <div className="popover-item px-4 py-2 text-sm text-status-red flex items-center gap-2" onClick={handleUserAction}>
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
                  <Command.Item onSelect={() => { window.location.href='/'; setOpenCommand(false); }}>Control Tower</Command.Item>
                  <Command.Item onSelect={() => { window.location.href='/vehicles'; setOpenCommand(false); }}>Fleet Registry</Command.Item>
                  <Command.Item onSelect={() => { window.location.href='/drivers'; setOpenCommand(false); }}>Drivers</Command.Item>
                </Command.Group>
                <Command.Group heading="Quick Actions">
                  <Command.Item onSelect={() => { window.location.href='/'; setOpenCommand(false); }}>New Dispatch</Command.Item>
                  <Command.Item onSelect={() => { window.location.href='/vehicles?action=add'; setOpenCommand(false); }}>Add Vehicle</Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </div>
        </div>
      )}
    </header>
  );
}
