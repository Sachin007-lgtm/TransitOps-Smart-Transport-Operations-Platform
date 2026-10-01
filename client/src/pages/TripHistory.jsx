import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Info, MapPin, IndianRupee, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../utils/api';
import { tripCode } from '../utils/tripCode';

// Billing-status filters: every trip here is already Completed, so the
// question this page answers is "what have we finished and is it billed yet?"
const HISTORY_STATUS_FILTERS = ['All', 'Billed', 'Unbilled'];

const fmtDate = (value) => {
  if (!value) return '--';
  const d = new Date(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtMoney = (value) => {
  const n = parseFloat(value);
  return n > 0 ? `₹${n.toLocaleString('en-IN')}` : '--';
};

export default function TripHistory() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Standard dropdown UI state (same pattern as Vehicles/Drivers toolbars)
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const statusRef = useRef(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let isMounted = true;
    const load = async (silent = false) => {
      if (!isMounted) return;
      if (!silent) setLoading(true);
      try {
        setError('');
        const res = await apiRequest('GET', '/trips');
        if (!isMounted) return;
        // Completed trips only — this page is the record of finished work.
        setTrips((res.data || []).filter(t => t.status === 'Completed'));
      } catch (err) {
        // Silent background refreshes keep the last good data instead of
        // flashing an error on a transient network hiccup.
        if (isMounted && !silent) setError(err.message || 'Failed to load trip history.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    // Auto-refresh, same as the tracking list: trips completed elsewhere
    // (the mobile app, another dispatcher) appear here without a reload.
    const interval = setInterval(() => load(true), 6000);
    return () => { isMounted = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (statusRef.current && !statusRef.current.contains(e.target)) {
        setIsStatusOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, []);

  const filteredTrips = trips.filter(t => {
    if (statusFilter !== 'All' && t.billing_status !== statusFilter) return false;
    const q = (search || '').toLowerCase();
    if (!q) return true;
    return (
      String(t.id).toLowerCase().includes(q) ||
      (t.origin || '').toLowerCase().includes(q) ||
      (t.destination || '').toLowerCase().includes(q) ||
      (t.external_party_name || '').toLowerCase().includes(q) ||
      (t.vehicle?.registration_number || '').toLowerCase().includes(q) ||
      (t.driver?.name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fade-in">
      {/* Header Row (Matches Vehicles/Drivers pages) */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl heading">Trip History</h1>
          <p className="text-sm text-muted mt-1">
            Completed trips with their customer, fare and billing state.
          </p>
        </div>
        {error && <span className="text-xs text-status-red">{error}</span>}
      </div>

      {/* Toolbar: Search + Billing-status filter (Matches Vehicles.jsx) */}
      <div className="flex items-center gap-4 mb-6" style={{ position: 'relative', zIndex: 10, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', width: '240px' }}>
          <Search size={16} className="text-muted" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search trip, customer, route..."
            className="input"
            style={{ width: '100%', paddingLeft: '2.5rem' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Billing-status Filter Dropdown */}
        <div style={{ position: 'relative', width: '160px' }} ref={statusRef}>
          <div
            className="input flex items-center justify-between"
            style={{ cursor: 'pointer' }}
            onClick={() => setIsStatusOpen(!isStatusOpen)}
          >
            <span>{statusFilter}</span>
            <ChevronDown
              size={16}
              className="text-muted"
              style={{ transform: isStatusOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
            />
          </div>
          {isStatusOpen && (
            <div className="custom-dropdown-menu">
              {HISTORY_STATUS_FILTERS.map(s => (
                <div
                  key={s}
                  className="custom-dropdown-item"
                  onClick={() => {
                    setStatusFilter(s);
                    setIsStatusOpen(false);
                  }}
                >
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* History Table (Matches Vehicles.jsx: card overflow:hidden, standard table-container) */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead style={{ backgroundColor: '#fafafa' }}>
              <tr>
                <th style={{ paddingLeft: '1.5rem' }}>Trip</th>
                <th>Customer</th>
                <th>Route</th>
                <th>Vehicle</th>
                <th>Driver</th>
                <th>Date</th>
                <th style={{ textAlign: 'right', paddingRight: '1.5rem' }}>Fare</th>
                <th style={{ textAlign: 'center' }}>Billing</th>
              </tr>
            </thead>
            <tbody>
              {loading && trips.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-muted">Loading trip history...</td>
                </tr>
              ) : filteredTrips.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-muted">
                    {trips.length === 0
                      ? 'No completed trips yet. Finish a trip on the Trips page and it appears here.'
                      : 'No trips match this filter.'}
                  </td>
                </tr>
              ) : (
                filteredTrips.map((t, idx) => (
                  <tr
                    key={t.id || idx}
                    className="table-row-animate"
                    style={{ animationDelay: `${idx * 40}ms`, borderLeft: '4px solid rgba(34, 160, 107, 0.5)' }}
                  >
                    {/* Trip ID */}
                    <td className="mono text-xs font-medium" style={{ paddingLeft: '1.5rem' }}>
                      {tripCode(t.id)}
                    </td>

                    {/* Customer */}
                    <td className="text-sm">{t.external_party_name || <span className="text-muted">No customer</span>}</td>

                    {/* Route */}
                    <td className="text-sm">
                      <div className="flex items-center gap-2">
                        <span>{t.origin}</span>
                        <span className="text-muted">→</span>
                        <span>{t.destination}</span>
                      </div>
                    </td>

                    {/* Vehicle */}
                    <td className="mono text-xs">{t.vehicle?.registration_number || '--'}</td>

                    {/* Driver */}
                    <td className="text-sm">{t.driver?.name || '--'}</td>

                    {/* Date */}
                    <td className="mono text-xs">{fmtDate(t.actual_arrival || t.trip_date || t.start_time)}</td>

                    {/* Fare */}
                    <td className="mono text-sm font-medium" style={{ textAlign: 'right', paddingRight: '1.5rem' }}>
                      {fmtMoney(t.revenue)}
                    </td>

                    {/* Billing state */}
                    <td style={{ textAlign: 'center' }}>
                      <span
                        className={`pill mono text-xs font-semibold px-2.5 py-0.5 ${t.billing_status === 'Billed' ? 'pill-green' : 'pill-orange'}`}
                        title={t.billing_status === 'Billed' ? 'This trip is on a bill' : 'Not on a bill yet'}
                      >
                        {t.billing_status === 'Billed' ? 'Billed' : 'Unbilled'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rules (Matches Vehicles/Drivers standard layout) */}
      <div className="mt-4 flex items-center gap-6">
        <div className="text-xs text-muted font-medium flex items-center gap-1">
          <Info size={14} /> Trips move here when they are marked Completed on the Trips page
        </div>
        <div className="text-xs text-muted font-medium flex items-center gap-1">
          <Info size={14} /> Billed trips are already on a customer statement
        </div>
      </div>
    </div>
  );
}
