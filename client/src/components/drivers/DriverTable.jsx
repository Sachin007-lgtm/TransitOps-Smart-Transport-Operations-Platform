import React from 'react';
import { Info } from 'lucide-react';
import DriverActionMenu from './DriverActionMenu';
import {
  isLicenseExpired,
  isLicenseExpiringSoon,
  formatExpiryMMDDYY,
  getLeftBorderColor,
  getAvatarColor
} from './driverConstants';

export default function DriverTable({
  drivers,
  loading,
  onStatusChange,
  onEdit,
  onResetPassword,
  onDelete
}) {
  return (
    <>
      {/* Table Area (Matches Vehicles.jsx: card overflow:hidden, standard table-container) */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead style={{ backgroundColor: '#fafafa' }}>
              <tr>
                <th style={{ paddingLeft: '1.5rem' }}>Driver Name</th>
                <th>License no.</th>
                <th>Licence Expiry</th>
                <th>Contact</th>
                <th style={{ textAlign: 'center' }}>Trips Count</th>
                <th style={{ textAlign: 'center' }}>App access</th>
                <th>Status</th>
                <th style={{ textAlign: 'right', paddingRight: '1.5rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && drivers.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-muted">
                    Loading driver roster...
                  </td>
                </tr>
              ) : drivers.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-muted">
                    No drivers registered in your roster yet. Click "+ Add Driver" above to register your first driver.
                  </td>
                </tr>
              ) : (
                drivers.map((d, idx) => {
                  const expired = isLicenseExpired(d.license_expiry_date);
                  const expiringSoon = isLicenseExpiringSoon(d.license_expiry_date);
                  const isOnTrip = d.status === 'On Trip' || d.status === 'On trip';

                  return (
                    <tr
                      key={d.id || idx}
                      className="table-row-animate cursor-pointer hover:bg-[#fcfcfc]"
                      onClick={() => onEdit(d)}
                      style={{
                        animationDelay: `${idx * 40}ms`,
                        borderLeft: `4px solid ${getLeftBorderColor(d.status)}`
                      }}
                    >
                      {/* Driver Name (Category subtitle completely removed) */}
                      <td style={{ paddingLeft: '1.5rem' }}>
                        <div className="flex items-center gap-3">
                          <div
                            className="driver-avatar"
                            style={{ backgroundColor: getAvatarColor(d.name) }}
                          >
                            {d.name ? d.name.substring(0, 2).toUpperCase() : 'DR'}
                          </div>
                          <div>
                            <span className="font-medium text-sm block">{d.name}</span>
                          </div>
                        </div>
                      </td>

                      {/* License Number */}
                      <td className="mono text-xs font-medium">{d.license_number}</td>

                      {/* License Expiry */}
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="mono text-xs">
                            {formatExpiryMMDDYY(d.license_expiry_date)}
                          </span>
                          {expired && (
                            <span className="pill pill-red" style={{ fontSize: '0.6rem', padding: '0.15rem 0.35rem' }}>
                              EXPIRED
                            </span>
                          )}
                          {expiringSoon && (
                            <span className="pill pill-orange" style={{ fontSize: '0.6rem', padding: '0.15rem 0.35rem' }}>
                              EXP IN 30D
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="mono text-xs">
                        {d.contact_number
                          ? d.contact_number.startsWith('+91')
                            ? d.contact_number
                            : `+91 ${d.contact_number}`
                          : ''}
                      </td>

                      {/* Trips Count */}
                      <td className="mono font-medium" style={{ fontSize: '0.95rem', textAlign: 'center' }}>
                        {d.trips_count ?? 0}
                      </td>

                      {/* App Access */}
                      <td style={{ textAlign: 'center' }}>
                        {d.must_change_password ? (
                          <span
                            className="pill pill-orange mono text-xs font-semibold px-2.5 py-0.5"
                            title="Driver must change password on first mobile login"
                          >
                            Pending 1st Login
                          </span>
                        ) : (
                          <span
                            className="pill pill-green mono text-xs font-semibold px-2.5 py-0.5"
                            title="Permanent password set"
                          >
                            Active
                          </span>
                        )}
                      </td>

                      {/* Status Dropdown (Standard Pill Select matching Vehicles page) */}
                      <td>
                        <select
                          className="select"
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            borderRadius: '20px',
                            cursor: isOnTrip ? 'not-allowed' : 'pointer',
                            border: '1px solid var(--border-color, #e5e7eb)',
                            backgroundColor:
                              d.status === 'Available'
                                ? 'rgba(74, 222, 128, 0.15)'
                                : isOnTrip
                                ? 'rgba(96, 165, 250, 0.15)'
                                : d.status === 'Suspended'
                                ? 'rgba(239, 68, 68, 0.15)'
                                : 'rgba(156, 163, 175, 0.15)',
                            color:
                              d.status === 'Available'
                                ? '#16a34a'
                                : isOnTrip
                                ? '#2563eb'
                                : d.status === 'Suspended'
                                ? '#dc2626'
                                : '#4b5563'
                          }}
                          value={isOnTrip ? 'On Trip' : d.status || 'Available'}
                          disabled={isOnTrip}
                          onClick={(e) => e.stopPropagation()}
                          title={
                            isOnTrip
                              ? 'Driver is currently On Trip — managed automatically by trip dispatch'
                              : 'Change status'
                          }
                          onChange={(e) => onStatusChange(d.id, e.target.value)}
                        >
                          {isOnTrip && <option value="On Trip">On Trip 🔒</option>}
                          <option value="Available">Available</option>
                          <option value="Off Duty">Off Duty</option>
                          <option value="Suspended">Suspended</option>
                        </select>
                      </td>

                      {/* Actions Column */}
                      <td style={{ textAlign: 'right', paddingRight: '1.5rem' }}>
                        <DriverActionMenu
                          driver={d}
                          onEdit={onEdit}
                          onResetPassword={onResetPassword}
                          onDelete={onDelete}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rules (Matching Vehicles page standard layout) */}
      <div className="mt-4 flex items-center gap-6">
        <div className="text-xs text-status-red font-medium flex items-center gap-1">
          <Info size={14} /> License numbers must follow 15-character Indian format: SS-RR-YYYY-NNNNNNN
        </div>
        <div className="text-xs text-muted font-medium flex items-center gap-1">
          <Info size={14} /> Drivers marked On Trip 🔒 are dispatched and locked automatically
        </div>
      </div>
    </>
  );
}
