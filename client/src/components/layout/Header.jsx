import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Bell, 
  User, 
  Settings, 
  LogOut, 
  ChevronRight, 
  ShieldAlert, 
  Wrench, 
  FileWarning, 
  KeyRound,
  CheckCheck,
  CheckCircle2,
  X,
  Truck
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { useGlobalSearch } from '../../contexts/GlobalSearchContext';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../utils/api';
import ChangePasswordModal from '../auth/ChangePasswordModal';
import EditProfileModal from '../auth/EditProfileModal';
import './Header.css';

export default function Header() {
  const [openCommand, setOpenCommand] = useState(false);
  const [openPopover, setOpenPopover] = useState(null); // 'bell' | 'user' | null
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const { globalSearch, setGlobalSearch } = useGlobalSearch();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isDispatching = location.pathname === '/trips';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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

  const [notifications, setNotifications] = useState([
    {
      id: 'notif-default-1',
      type: 'license',
      title: 'License Expiry Warning',
      message: "Driver Priya's commercial license expires in 3 days.",
      time: 'Urgent',
      unread: true,
      link: '/drivers',
      actionText: 'Review Driver'
    },
    {
      id: 'notif-default-2',
      type: 'lock',
      title: 'Vehicle Locked from Dispatch',
      message: 'MINI-03 is locked due to pending vehicle inspection.',
      time: '2h ago',
      unread: true,
      link: '/vehicles',
      actionText: 'Inspect Fleet'
    },
    {
      id: 'notif-default-3',
      type: 'maintenance',
      title: 'Scheduled Maintenance Due',
      message: 'VAN-05 has reached 19,700 km and requires service check.',
      time: 'Today',
      unread: true,
      link: '/maintenance',
      actionText: 'Open Service'
    }
  ]);
  const [notifFilter, setNotifFilter] = useState('all'); // 'all' | 'alerts' | 'fleet'

  // Fetch real fleet data to supplement operational alerts
  useEffect(() => {
    let isMounted = true;
    async function fetchOperationalAlerts() {
      try {
        const [driversRes, vehiclesRes] = await Promise.allSettled([
          apiRequest('GET', '/drivers'),
          apiRequest('GET', '/vehicles')
        ]);

        if (!isMounted) return;

        const dynamicAlerts = [];
        if (driversRes.status === 'fulfilled' && Array.isArray(driversRes.value?.data)) {
          const now = new Date();
          const thirtyDays = 30 * 24 * 60 * 60 * 1000;
          driversRes.value.data.forEach(d => {
            if (d.license_expiry_date) {
              const exp = new Date(d.license_expiry_date);
              const diff = exp - now;
              if (diff < 0) {
                dynamicAlerts.push({
                  id: `driver-exp-${d.id}`,
                  type: 'license',
                  title: 'License Expired',
                  message: `${d.name}'s commercial license has expired. Action required.`,
                  time: 'Expired',
                  unread: true,
                  link: `/drivers/${d.id}`,
                  actionText: 'View Documents'
                });
              } else if (diff < thirtyDays) {
                const days = Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
                dynamicAlerts.push({
                  id: `driver-exp-${d.id}`,
                  type: 'license',
                  title: 'License Expiring Soon',
                  message: `${d.name}'s license expires in ${days} days. Renewal required.`,
                  time: `${days}d left`,
                  unread: true,
                  link: `/drivers/${d.id}`,
                  actionText: 'View Documents'
                });
              }
            }
          });
        }

        if (vehiclesRes.status === 'fulfilled' && Array.isArray(vehiclesRes.value?.data)) {
          vehiclesRes.value.data.forEach(v => {
            const st = String(v.status || '').toLowerCase();
            if (st === 'maintenance' || st === 'in shop') {
              dynamicAlerts.push({
                id: `veh-maint-${v.id}`,
                type: 'maintenance',
                title: 'Vehicle in Maintenance',
                message: `${v.number_plate} (${v.type || 'Fleet'}) is currently offline in service.`,
                time: 'In Service',
                unread: true,
                link: `/vehicles/${v.id}`,
                actionText: 'View Vehicle'
              });
            }
          });
        }

        if (dynamicAlerts.length > 0) {
          setNotifications(prev => {
            const dynamicIds = new Set(dynamicAlerts.map(a => a.id));
            const filteredPrev = prev.filter(p => !dynamicIds.has(p.id));
            return [...dynamicAlerts, ...filteredPrev];
          });
        }
      } catch (err) {
        // quiet fallback
      }
    }

    fetchOperationalAlerts();
    return () => { isMounted = false; };
  }, []);

  // Listen to live system toasts to append real-time notifications
  useEffect(() => {
    const handleToast = (e) => {
      const msg = typeof e.detail === 'string' ? e.detail : e.detail?.message || '';
      if (!msg) return;
      const isErr = String(e.type || e.detail?.type || '').includes('error');
      const newNotif = {
        id: `toast-${Date.now()}`,
        type: isErr ? 'lock' : 'dispatch',
        title: isErr ? 'Operational Alert' : 'System Update',
        message: msg,
        time: 'Just now',
        unread: true,
        link: location.pathname,
        actionText: 'View'
      };
      setNotifications(prev => [newNotif, ...prev.slice(0, 19)]);
    };

    window.addEventListener('app-toast', handleToast);
    return () => window.removeEventListener('app-toast', handleToast);
  }, [location.pathname]);

  const markAllAsRead = (e) => {
    e.stopPropagation();
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
  };

  const markAsRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, unread: false } : n));
  };

  const removeNotification = (id, e) => {
    e.stopPropagation();
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = (e) => {
    e.stopPropagation();
    setNotifications([]);
  };

  const getNotifStyle = (type) => {
    switch (type) {
      case 'license':
        return {
          icon: FileWarning,
          iconBg: 'rgba(239, 68, 68, 0.12)',
          iconColor: '#dc2626'
        };
      case 'lock':
        return {
          icon: ShieldAlert,
          iconBg: 'rgba(249, 115, 22, 0.12)',
          iconColor: '#ea580c'
        };
      case 'maintenance':
        return {
          icon: Wrench,
          iconBg: 'rgba(59, 130, 246, 0.12)',
          iconColor: '#2563eb'
        };
      case 'dispatch':
      default:
        return {
          icon: Truck,
          iconBg: 'rgba(16, 185, 129, 0.12)',
          iconColor: '#059669'
        };
    }
  };

  const filteredNotifs = notifications.filter(n => {
    if (notifFilter === 'alerts') return n.type === 'license' || n.type === 'lock';
    if (notifFilter === 'fleet') return n.type === 'maintenance' || n.type === 'dispatch';
    return true;
  });
  const unreadCount = notifications.filter(n => n.unread).length;

  return (
    <header className="header">
      <div className="header-search-container" style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '340px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--sub)' }} />
        <input 
          type="text" 
          placeholder={user?.role === 'Platform Admin' ? "Search organizations, managers..." : "Search vehicles, drivers, trips..."} 
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
        <div className="relative" ref={bellRef} style={{ position: 'relative' }}>
          <button 
            type="button"
            className={`header-bell-btn ${openPopover === 'bell' ? 'active' : ''}`}
            onClick={() => togglePopover('bell')}
            title="Notifications and operational alerts"
          >
            <Bell size={18} className={unreadCount > 0 ? "text-bell-active" : "text-muted"} />
            {unreadCount > 0 && (
              <span className="header-bell-badge">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {openPopover === 'bell' && (
            <div className="popover-menu header-notifications-popover" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="notif-header">
                <div className="notif-header-left">
                  <div className="notif-header-icon-wrap">
                    <Bell size={15} />
                  </div>
                  <h3 className="notif-header-title">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="notif-unread-pill">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="notif-mark-read-btn"
                    onClick={markAllAsRead}
                    title="Mark all notifications as read"
                  >
                    <CheckCheck size={14} />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="notif-tabs">
                <button
                  type="button"
                  className={`notif-tab ${notifFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setNotifFilter('all')}
                >
                  All ({notifications.length})
                </button>
                <button
                  type="button"
                  className={`notif-tab ${notifFilter === 'alerts' ? 'active' : ''}`}
                  onClick={() => setNotifFilter('alerts')}
                >
                  Alerts ({notifications.filter(n => n.type === 'license' || n.type === 'lock').length})
                </button>
                <button
                  type="button"
                  className={`notif-tab ${notifFilter === 'fleet' ? 'active' : ''}`}
                  onClick={() => setNotifFilter('fleet')}
                >
                  Fleet ({notifications.filter(n => n.type === 'maintenance' || n.type === 'dispatch').length})
                </button>
              </div>

              {/* Notification List */}
              <div className="notif-list-container">
                {filteredNotifs.length === 0 ? (
                  <div className="notif-empty-state">
                    <div className="notif-empty-icon">
                      <CheckCircle2 size={28} />
                    </div>
                    <div className="notif-empty-title">All caught up!</div>
                    <div className="notif-empty-desc">
                      {notifFilter === 'all' 
                        ? 'No notifications right now. Operations running smoothly.'
                        : `No ${notifFilter} notifications at this time.`}
                    </div>
                  </div>
                ) : (
                  filteredNotifs.map((n) => {
                    const { icon: NotifIcon, iconBg, iconColor } = getNotifStyle(n.type);
                    return (
                      <div
                        key={n.id}
                        className={`notif-card ${n.unread ? 'unread' : ''}`}
                        onClick={() => {
                          markAsRead(n.id);
                          if (n.link) {
                            navigate(n.link);
                            setOpenPopover(null);
                          }
                        }}
                      >
                        <div className="notif-card-icon" style={{ backgroundColor: iconBg, color: iconColor }}>
                          <NotifIcon size={16} />
                        </div>

                        <div className="notif-card-body">
                          <div className="notif-card-top">
                            <span className="notif-card-title">{n.title}</span>
                            <div className="notif-card-meta">
                              <span className="notif-card-time">{n.time}</span>
                              <button
                                type="button"
                                className="notif-dismiss-btn"
                                onClick={(e) => removeNotification(n.id, e)}
                                title="Dismiss notification"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>

                          <p className="notif-card-message">{n.message}</p>

                          {n.actionText && (
                            <div className="notif-card-action">
                              <span>{n.actionText}</span>
                              <ChevronRight size={13} />
                            </div>
                          )}
                        </div>

                        {n.unread && <span className="notif-unread-dot" />}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="notif-footer">
                <div className="notif-footer-text">
                  Operational Control Feed
                </div>
                {notifications.length > 0 && (
                  <button
                    type="button"
                    className="notif-clear-btn"
                    onClick={clearAll}
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Block */}
        <div className="relative" ref={userRef} style={{ position: 'relative' }}>
          {(() => {
            const displayName = user?.name || 'Operations Manager';
            const displayRole = user?.role || 'Owner/Manager';
            const displayContact = user?.email || user?.phone_number || 'manager@transitops.com';
            const initials = displayName
              .trim()
              .split(/\s+/)
              .map(n => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase() || 'TO';            return (
              <>
                <button
                  type="button"
                  className={`header-user-btn ${openPopover === 'user' ? 'active' : ''}`}
                  onClick={() => togglePopover('user')}
                  title="Account profile & settings"
                >
                  <div className="header-avatar-wrap">
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt={displayName} className="header-avatar-img" />
                    ) : (
                      <div className="header-avatar-fallback">{initials}</div>
                    )}
                  </div>
                  <div className="header-profile-text">
                    <span className="heading" style={{ fontSize: '0.875rem', lineHeight: '1.2' }}>{displayName}</span>
                    <span className="text-muted" style={{ fontSize: '0.75rem', lineHeight: '1.2' }}>{displayRole}</span>
                  </div>
                  <ChevronRight size={14} className="text-muted" style={{ transform: openPopover === 'user' ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.2s' }} />
                </button>

                {openPopover === 'user' && (
                  <div className="popover-menu header-profile-popover">
                    <div className="header-popover-user-card">
                      <div className="header-popover-avatar">
                        {user?.avatar_url ? (
                          <img src={user.avatar_url} alt={displayName} />
                        ) : (
                          <div className="header-avatar-fallback">{initials}</div>
                        )}
                      </div>
                      <div className="header-popover-info">
                        <div className="header-popover-name" title={displayName}>{displayName}</div>
                        <div className="header-popover-role">
                          <span>{displayRole}</span>
                        </div>
                        {user?.organization_name && (
                          <div className="header-popover-org">{user.organization_name}</div>
                        )}
                      </div>
                    </div>

                    <div className="py-1">
                      {/* Settings Option in Profile Section */}
                      <button
                        type="button"
                        className="header-menu-link"
                        onClick={() => {
                          setOpenPopover(null);
                          navigate('/settings');
                        }}
                      >
                        <Settings size={16} className="text-muted" />
                        <span>Settings & Preferences</span>
                      </button>

                      {/* Edit Profile & Photo */}
                      <button
                        type="button"
                        className="header-menu-link"
                        onClick={() => {
                          setOpenPopover(null);
                          setIsEditProfileOpen(true);
                        }}
                      >
                        <User size={16} className="text-muted" />
                        <span>Edit Profile & Photo</span>
                      </button>

                      {/* Change Password */}
                      <button
                        type="button"
                        className="header-menu-link"
                        onClick={() => {
                          setOpenPopover(null);
                          setIsChangePasswordOpen(true);
                        }}
                      >
                        <KeyRound size={16} className="text-muted" />
                        <span>Change Password</span>
                      </button>
                    </div>

                    <div className="border-t border-[var(--line)] py-1">
                      <button
                        type="button"
                        className="header-menu-link danger"
                        onClick={handleLogout}
                      >
                        <LogOut size={16} />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>

      </div>

      {/* Edit Profile & Photo Modal */}
      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
      />

      {/* Voluntary Password Change Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />

      {/* Command Palette Overlay */}
      {openCommand && (
        <div className="command-palette-overlay" onClick={() => setOpenCommand(false)}>
          <div className="command-palette" onClick={(e) => e.stopPropagation()}>
            <Command>
              <Command.Input placeholder="Type a command or search..." autoFocus />
              <Command.List>
                <Command.Empty>No results found.</Command.Empty>
                {user?.role === 'Platform Admin' ? (
                  <Command.Group heading="Platform Superadmin">
                    <Command.Item onSelect={() => { navigate('/admin'); setOpenCommand(false); }}>Organizations Registry</Command.Item>
                  </Command.Group>
                ) : (
                  <>
                    <Command.Group heading="Pages">
                      <Command.Item onSelect={() => { navigate('/'); setOpenCommand(false); }}>Control Tower</Command.Item>
                      <Command.Item onSelect={() => { navigate('/vehicles'); setOpenCommand(false); }}>Fleet Registry</Command.Item>
                      <Command.Item onSelect={() => { navigate('/drivers'); setOpenCommand(false); }}>Drivers</Command.Item>
                    </Command.Group>
                    <Command.Group heading="Quick Actions">
                      <Command.Item onSelect={() => { navigate('/'); setOpenCommand(false); }}>New Dispatch</Command.Item>
                      <Command.Item onSelect={() => { navigate('/vehicles?action=add'); setOpenCommand(false); }}>Add Vehicle</Command.Item>
                    </Command.Group>
                  </>
                )}
              </Command.List>
            </Command>
          </div>
        </div>
      )}
    </header>
  );
}
