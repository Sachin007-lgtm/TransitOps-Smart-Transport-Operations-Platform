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
  Truck,
  Clock
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { useGlobalSearch } from '../../contexts/GlobalSearchContext';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../utils/api';
import { tripCode } from '../../utils/tripCode';
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

  const [notifications, setNotifications] = useState([]);
  const [notifFilter, setNotifFilter] = useState('all'); // 'all' | 'alerts' | 'fleet'

  // Fetch real alerts from all data sources: driver license, vehicle docs, maintenance reports, vehicle status
  const fetchAllAlerts = React.useCallback(async () => {
    try {
      const [driversRes, vehiclesRes, docAlertsRes, maintenanceRes, delayedTripsRes] = await Promise.allSettled([
        apiRequest('GET', '/drivers'),
        apiRequest('GET', '/vehicles'),
        apiRequest('GET', '/documents/alerts'),
        apiRequest('GET', '/maintenance/driver-reports?view=active'),
        apiRequest('GET', '/trips/alerts/delayed')
      ]);

      const dynamicAlerts = [];
      const now = new Date();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;

      // --- Driver license expiry alerts ---
      if (driversRes.status === 'fulfilled' && Array.isArray(driversRes.value?.data)) {
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
                actionText: 'View Driver'
              });
            } else if (diff < thirtyDays) {
              const days = Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
              dynamicAlerts.push({
                id: `driver-exp-${d.id}`,
                type: 'license',
                title: 'License Expiring Soon',
                message: `${d.name}'s license expires in ${days} day${days !== 1 ? 's' : ''}. Renewal required.`,
                time: `${days}d left`,
                unread: true,
                link: `/drivers/${d.id}`,
                actionText: 'View Driver'
              });
            }
          }
        });
      }

      // --- Vehicle status alerts ---
      if (vehiclesRes.status === 'fulfilled' && Array.isArray(vehiclesRes.value?.data)) {
        vehiclesRes.value.data.forEach(v => {
          const st = String(v.status || '').toLowerCase();
          if (st === 'in shop') {
            dynamicAlerts.push({
              id: `veh-shop-${v.id}`,
              type: 'maintenance',
              title: 'Vehicle In Maintenance',
              message: `${v.registration_number || v.number_plate} (${v.type || 'Fleet'}) is currently offline in service.`,
              time: 'In Service',
              unread: true,
              link: `/vehicles/${v.id}`,
              actionText: 'View Vehicle'
            });
          }
        });
      }

      // --- Document expiry alerts (from /documents/alerts endpoint) ---
      if (docAlertsRes.status === 'fulfilled') {
        const docData = docAlertsRes.value?.data || docAlertsRes.value || [];
        const docs = Array.isArray(docData) ? docData : (docData.alerts || []);
        docs.forEach(doc => {
          const exp = new Date(doc.expiry_date);
          const diff = exp - now;
          const isExpired = diff < 0;
          const days = isExpired ? 0 : Math.ceil(diff / (24 * 60 * 60 * 1000));
          const entityLabel = doc.entity_type === 'DRIVER' ? 'Driver' : 'Vehicle';
          const entityName = doc.entity_name || doc.entity_id?.slice(0, 8) || 'Unknown';
          dynamicAlerts.push({
            id: `doc-${doc.id || doc.entity_id + doc.document_type}`,
            type: 'lock',
            title: isExpired ? `${doc.document_type} Expired` : `${doc.document_type} Expiring Soon`,
            message: isExpired
              ? `${entityLabel} ${entityName}: ${doc.document_type} expired on ${new Date(doc.expiry_date).toLocaleDateString('en-IN')}.`
              : `${entityLabel} ${entityName}: ${doc.document_type} expires in ${days} day${days !== 1 ? 's' : ''}.`,
            time: isExpired ? 'Expired' : `${days}d left`,
            unread: true,
            link: doc.entity_type === 'DRIVER' ? `/drivers/${doc.entity_id}` : `/vehicles/${doc.entity_id}`,
            actionText: 'View Documents'
          });
        });
      }

      // --- Driver maintenance report alerts ---
      if (maintenanceRes.status === 'fulfilled') {
        const reports = maintenanceRes.value?.data || [];
        reports.forEach(r => {
          if (r.status === 'Open' && r.approval_requested) {
            dynamicAlerts.push({
              id: `maint-approval-${r.id}`,
              type: 'maintenance',
              title: 'Maintenance Approval Needed',
              message: `${r.driver_name} requested approval for repair on ${r.vehicle_registration}. Trip: ${r.origin} → ${r.destination}.`,
              time: new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
              unread: true,
              link: '/maintenance',
              actionText: 'Review & Approve'
            });
          } else if (r.status === 'Open' && !r.approval_requested) {
            dynamicAlerts.push({
              id: `maint-open-${r.id}`,
              type: 'maintenance',
              title: 'Driver Reported Issue',
              message: `${r.driver_name} reported: "${r.description}" on ${r.vehicle_registration}.`,
              time: new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
              unread: true,
              link: '/maintenance',
              actionText: 'View Reports'
            });
          }
        });
      }

      // --- Overdue / Delayed Trip Start alerts ---
      if (delayedTripsRes.status === 'fulfilled' && Array.isArray(delayedTripsRes.value?.data)) {
        delayedTripsRes.value.data.forEach(t => {
          if (t.scheduled_start_time) {
            const sched = new Date(t.scheduled_start_time);
            const overdueMs = now - sched;
            if (overdueMs > 0) {
              const minutesOverdue = Math.floor(overdueMs / 60000);
              const overdueLabel = minutesOverdue < 60
                ? `${Math.max(1, minutesOverdue)}m overdue`
                : `${Math.floor(minutesOverdue / 60)}h ${minutesOverdue % 60}m overdue`;

              dynamicAlerts.push({
                id: `trip-delayed-${t.id}`,
                type: 'trip_delay',
                title: 'Trip Start Overdue',
                message: `Trip ${tripCode(t.id)} (${t.origin} → ${t.destination}) was scheduled to start at ${sched.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}, but has not started yet.`,
                time: overdueLabel,
                unread: true,
                link: '/trips',
                actionText: 'Dispatch Trip'
              });
            }
          }
        });
      }

      setNotifications(prev => {
        // Preserve toast-generated notifications (id starts with 'toast-')
        const toastNotifs = prev.filter(p => p.id.startsWith('toast-'));
        // Preserve read state from previously shown notifications
        const readIds = new Set(prev.filter(p => !p.unread).map(p => p.id));
        const merged = dynamicAlerts.map(a => ({ ...a, unread: readIds.has(a.id) ? false : a.unread }));
        return [...merged, ...toastNotifs];
      });
    } catch (err) {
      // quiet fallback — keep whatever we had
    }
  }, []);

  useEffect(() => {
    fetchAllAlerts();
    // Poll every 30 seconds for fresh alerts (was 60 — faster detection of doc/license expiry changes)
    const timer = setInterval(fetchAllAlerts, 30000);
    return () => clearInterval(timer);
  }, [fetchAllAlerts]);

  // Listen to live system toasts to append real-time notifications for important events
  useEffect(() => {
    const handleToast = (e) => {
      const detail = e.detail;
      const msg = typeof detail === 'string' ? detail : detail?.message || '';
      if (!msg) return;

      const isErr = String(detail?.type || detail?.toastType || '').includes('error') || (typeof detail === 'object' && detail?.type === 'error');
      const isMaintenance = msg.toLowerCase().includes('mainten') || msg.toLowerCase().includes('repair') || msg.toLowerCase().includes('approval');
      const isTrip = msg.toLowerCase().includes('trip') || msg.toLowerCase().includes('dispatch') || msg.toLowerCase().includes('completed');
      const isCredential = msg.toLowerCase().includes('registered') || msg.toLowerCase().includes('credentials') || msg.toLowerCase().includes('password reset');
      const isShop = msg.toLowerCase().includes('in shop') || msg.toLowerCase().includes('available');

      // Only surface: errors, maintenance, trip events, credential events, vehicle shop events
      if (!isErr && !isMaintenance && !isTrip && !isCredential && !isShop) return;

      let notifType = 'dispatch';
      let notifTitle = 'System Update';
      if (isErr) { notifType = 'lock'; notifTitle = 'Operational Alert'; }
      else if (isMaintenance) { notifType = 'maintenance'; notifTitle = 'Maintenance Update'; }
      else if (isTrip) { notifType = 'dispatch'; notifTitle = 'Trip Event'; }
      else if (isCredential) { notifType = 'dispatch'; notifTitle = 'Driver Access'; }
      else if (isShop) { notifType = 'maintenance'; notifTitle = 'Vehicle Status'; }

      const newNotif = {
        id: `toast-${Date.now()}`,
        type: notifType,
        title: notifTitle,
        message: msg,
        time: 'Just now',
        unread: true,
        link: location.pathname,
        actionText: 'View'
      };
      setNotifications(prev => [newNotif, ...prev.slice(0, 29)]);
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
      case 'trip_delay':
        return {
          icon: Clock,
          iconBg: 'rgba(239, 68, 68, 0.12)',
          iconColor: '#dc2626'
        };
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
    if (notifFilter === 'alerts') return n.type === 'license' || n.type === 'lock' || n.type === 'trip_delay';
    if (notifFilter === 'fleet') return n.type === 'maintenance' || n.type === 'dispatch' || n.type === 'trip_delay';
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
                  Alerts ({notifications.filter(n => n.type === 'license' || n.type === 'lock' || n.type === 'trip_delay').length})
                </button>
                <button
                  type="button"
                  className={`notif-tab ${notifFilter === 'fleet' ? 'active' : ''}`}
                  onClick={() => setNotifFilter('fleet')}
                >
                  Fleet ({notifications.filter(n => n.type === 'maintenance' || n.type === 'dispatch' || n.type === 'trip_delay').length})
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
              .toUpperCase() || 'TO';
            return (
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
