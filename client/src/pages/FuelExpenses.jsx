import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, RefreshCw, FileText, ChevronDown, ShieldAlert,
  AlertTriangle, CheckCircle2, XCircle, ExternalLink, X,
  Camera, Sparkles, UploadCloud, Check
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { apiRequest, apiOpenDocument, apiDownloadFile } from '../utils/api';
import { tripCode } from '../utils/tripCode';
import PageToolbar from '../components/common/PageToolbar';
import StatStrip from '../components/common/StatStrip';
import SideDrawer from '../components/common/SideDrawer';
import { scanReceiptWithOcr, parseFuelReceiptText, SAMPLE_RECEIPTS } from '../utils/fuelOcrParser';
import './FuelExpenses.css';

const PRIMARY_CATEGORIES = ['All', 'FUEL', 'MAINTENANCE', 'TOLL', 'OTHER'];
const MORE_CATEGORIES = ['TYRES', 'INSURANCE', 'PERMIT', 'EMI', 'SALARY', 'GARAGE'];
const ALL_CATEGORIES = ['FUEL', 'MAINTENANCE', 'TYRES', 'TOLL', 'INSURANCE', 'PERMIT', 'EMI', 'SALARY', 'GARAGE', 'OTHER'];

const CATEGORY_LABELS = {
  FUEL: 'Fuel',
  MAINTENANCE: 'Maintenance',
  TYRES: 'Tyres',
  TOLL: 'Toll',
  INSURANCE: 'Insurance',
  PERMIT: 'Permit',
  EMI: 'EMI',
  SALARY: 'Salary',
  GARAGE: 'Garage',
  OTHER: 'Other'
};

const today = () => new Date().toISOString().slice(0, 10);

export default function FuelExpenses() {
  const [expenses, setExpenses] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Drawer / Modal states
  const [isFuelDrawerOpen, setIsFuelDrawerOpen] = useState(false);
  const [isExpenseDrawerOpen, setIsExpenseDrawerOpen] = useState(false);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [reviewModal, setReviewModal] = useState({ open: false, expense: null, notes: '' });

  // Monthly bill state
  const currentMonth = () => new Date().toISOString().slice(0, 7);
  const [billMonth, setBillMonth] = useState(currentMonth());
  const [billData, setBillData] = useState(null);
  const [billLoading, setBillLoading] = useState(false);

  // Animation state (id of newly added row)
  const [newId, setNewId] = useState(null);

  // OCR states
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatusText, setOcrStatusText] = useState('');
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState(null);
  const [ocrExtractedData, setOcrExtractedData] = useState(null);

  // Form states
  const [fuelForm, setFuelForm] = useState({
    vehicle_id: '',
    date: today(),
    liters: '',
    cost: '',
    odometer: '',
    vendor: '',
    trip_id: '',
    invoice_number: '',
    receipt_url: ''
  });

  const [expenseForm, setExpenseForm] = useState({
    category: 'MAINTENANCE',
    vehicle_id: '',
    trip_id: '',
    date: today(),
    amount: '',
    description: '',
    vendor: '',
    payment_mode: 'Cash'
  });

  const formatCurrency = (val) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
      Number(val) || 0
    );

  const fetchExpenses = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const res = await apiRequest('GET', '/expenses');
      setExpenses((res.data && res.data.expenses) || []);
      setError(null);
    } catch (err) {
      if (!isBackground) setError(err.message || 'Could not load expenses.');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  const fetchPickups = useCallback(async () => {
    try {
      const vRes = await apiRequest('GET', '/vehicles');
      setVehicles((vRes.data && (Array.isArray(vRes.data) ? vRes.data : vRes.data.vehicles)) || []);
    } catch {
      /* pickup gracefully falls back */
    }
    try {
      const tRes = await apiRequest('GET', '/trips');
      const tData = tRes.data && (Array.isArray(tRes.data) ? tRes.data : tRes.data.trips);
      setTrips(Array.isArray(tData) ? tData : (tData && tData.trips) || []);
    } catch {
      /* pickup gracefully falls back */
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
    fetchPickups();
    const timer = setInterval(() => fetchExpenses(true), 15000);
    return () => clearInterval(timer);
  }, [fetchExpenses, fetchPickups]);

  // Filtered dataset
  const visible = expenses
    .filter((e) => (categoryFilter === 'All' ? true : e.category === categoryFilter))
    .filter((e) => (statusFilter === 'All' ? true : e.approval_status === statusFilter));

  const underReviewCount = expenses.filter(
    (e) => (categoryFilter === 'All' || e.category === categoryFilter) && e.approval_status === 'Under Review'
  ).length;

  // Calculated totals
  const totalCost = visible.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const fuelCost = visible
    .filter((e) => e.category === 'FUEL')
    .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const maintCost = visible
    .filter((e) => ['MAINTENANCE', 'TYRES', 'GARAGE'].includes(e.category))
    .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const otherCost = visible
    .filter((e) => !['FUEL', 'MAINTENANCE', 'TYRES', 'GARAGE'].includes(e.category))
    .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const totalLitres = visible
    .filter((e) => e.category === 'FUEL')
    .reduce((acc, e) => acc + (Number(e.quantity || e.litres || e.liters) || 0), 0);

  // Smart column visibility:
  // Show Odometer & Mileage only under FUEL filter or when rows contain odometer data
  const hasOdometerData = visible.some((e) => e.odometer != null);
  const showMileageCols = categoryFilter === 'FUEL' || hasOdometerData;
  const showVendorCol = visible.some((e) => Boolean(e.vendor || e.invoice_number)) || ['FUEL', 'MAINTENANCE'].includes(categoryFilter);

  // Column count for colspan: Date, Category, Description, Vehicle, Trip, Status, Amount (+ Mileage cols, + Vendor col)
  let colCount = 6;
  if (showMileageCols) colCount += 2; // Odometer, Mileage
  if (showVendorCol) colCount += 1; // Vendor

  const applyExtractedOcrData = (ext, previewUrl) => {
    setOcrExtractedData(ext);

    let matchedVehicleId = fuelForm.vehicle_id;
    if (ext.vehicle_registration && vehicles.length > 0) {
      const cleanTarget = ext.vehicle_registration.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const foundVeh = vehicles.find(v =>
        v.registration_number.replace(/[^A-Z0-9]/gi, '').toUpperCase() === cleanTarget
      );
      if (foundVeh) matchedVehicleId = foundVeh.id;
    }

    setFuelForm(prev => ({
      ...prev,
      vehicle_id: matchedVehicleId || prev.vehicle_id,
      date: ext.date || prev.date || today(),
      liters: ext.liters || prev.liters,
      cost: ext.amount || prev.cost,
      invoice_number: ext.bill_number || prev.invoice_number,
      vendor: ext.fuel_station || prev.vendor,
      odometer: ext.odometer || prev.odometer,
      receipt_url: previewUrl || prev.receipt_url
    }));

    window.dispatchEvent(
      new CustomEvent('app-toast', {
        detail: `✨ OCR Auto-Filled: Bill #${ext.bill_number || 'N/A'} · ${ext.liters || '0'} L · ₹${ext.amount || '0'}`,
        type: 'success'
      })
    );
  };

  const handleOcrFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setOcrPreviewUrl(previewUrl);
    setOcrScanning(true);
    setOcrProgress(10);
    setOcrStatusText('Loading Tesseract OCR engine…');

    try {
      const res = await scanReceiptWithOcr(file, ({ status, progress }) => {
        setOcrStatusText(status);
        if (progress) setOcrProgress(progress);
      });

      if (res.success && res.extracted) {
        applyExtractedOcrData(res.extracted, previewUrl);
      } else {
        window.dispatchEvent(
          new CustomEvent('app-toast', {
            detail: res.error || 'Could not parse text from this image. Please enter details manually.',
            type: 'error'
          })
        );
      }
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: 'Failed to scan receipt image.',
          type: 'error'
        })
      );
    } finally {
      setOcrScanning(false);
    }
  };

  const handleApplySampleReceipt = (sample) => {
    setOcrScanning(true);
    setOcrProgress(50);
    setOcrStatusText('Parsing sample slip…');
    setTimeout(() => {
      const extracted = parseFuelReceiptText(sample.sampleText);
      applyExtractedOcrData(extracted, null);
      setOcrScanning(false);
    }, 350);
  };

  const handleFuelSubmit = async (e) => {
    e.preventDefault();
    if (!fuelForm.vehicle_id || !fuelForm.liters || !fuelForm.cost || !fuelForm.odometer) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', '/fuel', {
        vehicle_id: fuelForm.vehicle_id,
        description: fuelForm.vendor ? `Diesel — ${fuelForm.vendor}` : 'Diesel fill',
        amount: parseFloat(fuelForm.cost),
        quantity: parseFloat(fuelForm.liters),
        odometer: parseFloat(fuelForm.odometer),
        expense_date: fuelForm.date || undefined,
        trip_id: fuelForm.trip_id || undefined,
        vendor: fuelForm.vendor || undefined,
        invoice_number: fuelForm.invoice_number ? fuelForm.invoice_number.trim() : undefined,
        receipt_url: fuelForm.receipt_url ? fuelForm.receipt_url.trim() : undefined,
        payment_mode: 'Cash'
      });
      setIsFuelDrawerOpen(false);
      setFuelForm({
        vehicle_id: '',
        date: today(),
        liters: '',
        cost: '',
        odometer: '',
        vendor: '',
        trip_id: '',
        invoice_number: '',
        receipt_url: ''
      });
      setNewId(res.data.id);
      setTimeout(() => setNewId(null), 1000);
      await fetchExpenses(true);
    } catch (err) {
      setError(err.message || 'Could not log the fuel entry.');
    } finally {
      setBusy(false);
    }
  };

  const handleReview = async (id, action, notes = '') => {
    setBusy(true);
    try {
      await apiRequest('PATCH', `/expenses/${id}/review`, { action, notes });
      setReviewModal({ open: false, expense: null, notes: '' });
      await fetchExpenses(true);
    } catch (err) {
      setError(err.message || 'Could not review the fuel claim.');
    } finally {
      setBusy(false);
    }
  };

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    if (!expenseForm.vehicle_id || !expenseForm.description.trim() || !expenseForm.amount) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', '/expenses', {
        vehicle_id: expenseForm.vehicle_id,
        category: expenseForm.category,
        description: expenseForm.description.trim(),
        amount: parseFloat(expenseForm.amount),
        expense_date: expenseForm.date || undefined,
        trip_id: expenseForm.trip_id || undefined,
        vendor: expenseForm.vendor || undefined,
        payment_mode: expenseForm.payment_mode
      });
      setIsExpenseDrawerOpen(false);
      setExpenseForm({
        category: 'MAINTENANCE',
        vehicle_id: '',
        trip_id: '',
        date: today(),
        amount: '',
        description: '',
        vendor: '',
        payment_mode: 'Cash'
      });
      setNewId(res.data.id);
      setTimeout(() => setNewId(null), 1000);
      await fetchExpenses(true);
    } catch (err) {
      setError(err.message || 'Could not log the expense.');
    } finally {
      setBusy(false);
    }
  };

  const fetchMonthlyBill = useCallback(async (month) => {
    if (!month) return;
    setBillLoading(true);
    try {
      const res = await apiRequest('GET', `/expenses/monthly-bill?month=${encodeURIComponent(month)}`);
      setBillData(res.data);
      setError(null);
    } catch (err) {
      setBillData(null);
      setError(err.message || 'Could not build the monthly bill.');
    } finally {
      setBillLoading(false);
    }
  }, []);

  const openBillModal = () => {
    setIsBillModalOpen(true);
    fetchMonthlyBill(billMonth);
  };

  const monthLabel = (ym) => {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const names = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${names[Number(m) - 1]} ${y}`;
  };

  const isMoreActive = MORE_CATEGORIES.includes(categoryFilter);

  return (
    <div className="fuel-page fade-in">
      {/* 1. Page Toolbar */}
      <PageToolbar
        title="Fuel & Expenses"
        tooltip="Consolidated operating-cost ledger: fuel fills, maintenance, tolls and company expenses."
        actions={
          <>
            <button
              className="btn btn-outline"
              onClick={openBillModal}
              title="Open monthly summary bill"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
            >
              <FileText size={14} /> Monthly Bill
            </button>
            <button
              className="btn btn-outline"
              onClick={() => setIsExpenseDrawerOpen(true)}
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
            >
              <Plus size={14} /> Add Expense
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setIsFuelDrawerOpen(true)}
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
            >
              <Plus size={14} /> Log Fuel
            </button>
          </>
        }
      >
        {/* Category Chips Bar (Single Line) */}
        <div className="category-filter-bar">
          {PRIMARY_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`filter-chip ${categoryFilter === cat ? 'active' : ''}`}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat === 'All' ? 'All' : CATEGORY_LABELS[cat] || cat}
            </button>
          ))}

          {/* More Categories Dropdown */}
          <select
            className={`category-more-select ${isMoreActive ? 'active' : ''}`}
            value={isMoreActive ? categoryFilter : ''}
            onChange={(e) => {
              if (e.target.value) setCategoryFilter(e.target.value);
            }}
          >
            <option value="" disabled={!isMoreActive}>
              {isMoreActive ? `More: ${CATEGORY_LABELS[categoryFilter] || categoryFilter}` : 'More ▾'}
            </option>
            {MORE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>
      </PageToolbar>

      {/* 2. Slim StatStrip */}
      <StatStrip
        items={[
          { label: 'Total', value: formatCurrency(totalCost), isDimmed: totalCost === 0 },
          {
            label: 'Fuel',
            value: `${formatCurrency(fuelCost)}${totalLitres > 0 ? ` (${Number(totalLitres).toLocaleString('en-IN')} L)` : ''}`,
            color: fuelCost > 0 ? '#c97514' : undefined,
            isDimmed: fuelCost === 0
          },
          {
            label: 'Maintenance',
            value: formatCurrency(maintCost),
            color: maintCost > 0 ? '#2563eb' : undefined,
            isDimmed: maintCost === 0
          },
          {
            label: 'Other',
            value: formatCurrency(otherCost),
            color: otherCost > 0 ? '#5c3a4c' : undefined,
            isDimmed: otherCost === 0
          }
        ]}
      />

      {/* Anti-Fraud Review Alert Banner */}
      {underReviewCount > 0 && (
        <div className="fe-review-banner">
          <div className="fe-review-banner-text">
            <ShieldAlert size={18} className="fe-banner-icon" />
            <span>
              <b>{underReviewCount} fuel claim{underReviewCount > 1 ? 's' : ''} require manager review</b> — potential duplicate receipts, odometer anomalies, or tank capacity exceedances.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            style={{ borderColor: 'rgba(217, 119, 6, 0.4)', color: '#b45309', background: '#fff' }}
            onClick={() => { setCategoryFilter('FUEL'); setStatusFilter(statusFilter === 'Under Review' ? 'All' : 'Under Review'); }}
          >
            {statusFilter === 'Under Review' ? 'Show All Claims' : 'Filter Under Review'}
          </button>
        </div>
      )}

      {/* Status filter bar */}
      <div className="status-filter-bar">
        <span className="status-filter-label">Approval Status:</span>
        {['All', 'Under Review', 'Approved', 'Rejected'].map((st) => (
          <button
            key={st}
            type="button"
            className={`status-chip ${statusFilter === st ? 'active' : ''} ${st === 'Under Review' && underReviewCount > 0 ? 'has-review' : ''}`}
            onClick={() => setStatusFilter(st)}
          >
            {st === 'Under Review' && underReviewCount > 0 && <span className="status-chip-dot" />}
            {st} {st === 'Under Review' && underReviewCount > 0 ? `(${underReviewCount})` : ''}
          </button>
        ))}
      </div>

      {error && (
        <div className="fe-error" role="alert">
          {error}
        </div>
      )}

      {/* 3. Dense Ledger Table (Starts immediately at y≈170) */}
      <div className="dense-table-wrapper">
        <div className="dense-table-scroll">
          <table className="dense-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Vehicle</th>
                <th>Trip</th>
                {showMileageCols && <th>Odometer</th>}
                {showMileageCols && <th>Mileage</th>}
                {showVendorCol && <th>Vendor / Bill #</th>}
                <th>Status & Anti-Fraud</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={colCount} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--sub)' }}>
                    Loading expense ledger…
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={colCount} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--sub)' }}>
                    No expenses logged yet under current filter.
                  </td>
                </tr>
              )}
              {!loading &&
                visible.map((exp) => (
                  <tr key={exp.id} className={exp.id === newId ? 'fe-row-enter' : ''}>
                    <td className="mono">{exp.expense_date}</td>
                    <td>
                      <span
                        className={`fe-pill ${
                          exp.category === 'FUEL'
                            ? 'fe-pill-fuel'
                            : ['MAINTENANCE', 'TYRES', 'GARAGE'].includes(exp.category)
                            ? 'fe-pill-maint'
                            : 'fe-pill-other'
                        }`}
                      >
                        {CATEGORY_LABELS[exp.category] || exp.category}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{exp.description}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>{exp.vehicle_registration}</td>
                    <td className="mono">{exp.trip_id ? tripCode(exp.trip_id) : '—'}</td>
                    {showMileageCols && (
                      <td className="mono">
                        {exp.odometer != null ? `${Number(exp.odometer).toLocaleString('en-IN')} km` : '—'}
                      </td>
                    )}
                    {showMileageCols && (
                      <td className="mono">
                        {exp.km_per_litre != null
                          ? `${exp.distance_since_prev != null ? `${Number(exp.distance_since_prev).toLocaleString('en-IN')} km · ` : ''}${exp.km_per_litre} km/l`
                          : '—'}
                      </td>
                    )}
                    {showVendorCol && (
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <span>{exp.vendor || '—'}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            {exp.invoice_number && (
                              <span className="fe-bill-tag">
                                #{exp.invoice_number}
                              </span>
                            )}
                            {exp.receipt_url && (
                              <a
                                href={exp.receipt_url}
                                target="_blank"
                                rel="noreferrer"
                                className="fe-receipt-link"
                                title="Open receipt image"
                              >
                                <ExternalLink size={10} /> receipt
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                    )}
                    <td>
                      {exp.approval_status === 'Under Review' ? (
                        <div className="fe-status-cell">
                          <button
                            type="button"
                            className="fe-status-badge fe-badge-review"
                            onClick={() => setReviewModal({ open: true, expense: exp, notes: '' })}
                            title="Click to view fraud warnings & review"
                          >
                            <AlertTriangle size={11} /> Under Review ({exp.flag_reasons?.length || 1})
                          </button>
                          <div className="fe-quick-actions">
                            <button
                              type="button"
                              className="fe-act-btn fe-act-approve"
                              title="Approve claim"
                              disabled={busy}
                              onClick={() => handleReview(exp.id, 'APPROVE')}
                            >
                              <CheckCircle2 size={13} />
                            </button>
                            <button
                              type="button"
                              className="fe-act-btn fe-act-reject"
                              title="Reject claim"
                              disabled={busy}
                              onClick={() => setReviewModal({ open: true, expense: exp, notes: '' })}
                            >
                              <XCircle size={13} />
                            </button>
                          </div>
                        </div>
                      ) : exp.approval_status === 'Rejected' ? (
                        <span
                          className="fe-status-badge fe-badge-rejected"
                          title={exp.review_notes ? `Rejected: ${exp.review_notes}` : 'Rejected claim'}
                        >
                          <XCircle size={11} /> Rejected
                        </span>
                      ) : (
                        <span className="fe-status-badge fe-badge-approved">
                          <CheckCircle2 size={11} /> Approved
                        </span>
                      )}
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {formatCurrency(exp.amount)}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={colCount - 1} style={{ textAlign: 'right' }}>
                  Filtered Total:
                </td>
                <td className="num">{formatCurrency(totalCost)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 4. SideDrawer: Log Fuel Fill */}
      <SideDrawer
        isOpen={isFuelDrawerOpen}
        onClose={() => setIsFuelDrawerOpen(false)}
        title="Log Fuel Fill"
        subtitle="From the pump bill: litres, amount, and odometer reading"
      >
        <form onSubmit={handleFuelSubmit}>
          {/* Smart Receipt OCR Scanner Box */}
          <div className="ocr-scanner-card">
            <div className="ocr-scanner-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Sparkles size={16} color="#d97706" />
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Smart Pump Bill OCR</span>
              </div>
              <span className="ocr-badge-ai">AI Auto-Extract</span>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--sub)', margin: '0.2rem 0 0.65rem 0' }}>
              Upload pump slip or snap a photo to auto-extract bill number, volume, rate &amp; amount.
            </p>

            {/* Drop / Upload zone */}
            <label className={`ocr-drop-zone ${ocrScanning ? 'scanning' : ''}`}>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleOcrFileSelect}
                disabled={ocrScanning}
              />
              {ocrScanning ? (
                <div className="ocr-scanning-state">
                  <div className="ocr-scan-line" />
                  <RefreshCw size={24} className="animate-spin text-amber-600" />
                  <span style={{ fontWeight: 600, fontSize: '0.8rem', marginTop: '0.4rem', color: '#b45309' }}>
                    {ocrStatusText} ({ocrProgress}%)
                  </span>
                </div>
              ) : ocrPreviewUrl ? (
                <div className="ocr-preview-state">
                  <img src={ocrPreviewUrl} alt="Receipt preview" className="ocr-thumb" />
                  <div style={{ textAlign: 'left', flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#16a34a' }}>
                      ✓ Slip Attached &amp; Scanned
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--sub)' }}>
                      Click to choose another photo or test sample slips below
                    </div>
                  </div>
                </div>
              ) : (
                <div className="ocr-prompt-state">
                  <Camera size={22} color="var(--amber)" />
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text)' }}>
                      Take photo or upload pump slip
                    </span>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--sub)' }}>
                      PNG, JPG, WEBP supported
                    </span>
                  </div>
                </div>
              )}
            </label>

            {/* Pre-calibrated sample receipts for 1-click test/demo */}
            <div className="ocr-samples-bar">
              <span style={{ fontSize: '0.7rem', color: 'var(--sub)', fontWeight: 600 }}>Try sample slip:</span>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                {SAMPLE_RECEIPTS.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className="ocr-sample-chip"
                    onClick={() => handleApplySampleReceipt(s)}
                    disabled={ocrScanning}
                    title={`Auto-fill with ${s.station} receipt data`}
                  >
                    📄 {s.billNumber}
                  </button>
                ))}
              </div>
            </div>

            {ocrExtractedData && (
              <div className="ocr-success-pill">
                <span>✨ Auto-Extracted:</span>
                <strong>Bill #{ocrExtractedData.bill_number || 'N/A'}</strong> ·
                <strong>{ocrExtractedData.liters || '0'} L</strong> ·
                <strong>₹{ocrExtractedData.amount || '0'}</strong>
              </div>
            )}
          </div>

          <div className="input-group mb-4">
            <label>Vehicle *</label>
            <select
              required
              className="select w-full"
              value={fuelForm.vehicle_id}
              onChange={(e) => setFuelForm({ ...fuelForm, vehicle_id: e.target.value })}
            >
              <option value="">Select vehicle…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registration_number} ({v.type})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="input-group">
              <label>Date *</label>
              <input
                required
                type="date"
                className="input w-full"
                value={fuelForm.date}
                onChange={(e) => setFuelForm({ ...fuelForm, date: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Odometer (km) *</label>
              <input
                required
                type="number"
                min="1"
                step="0.1"
                className="input w-full"
                placeholder="45200"
                value={fuelForm.odometer}
                onChange={(e) => setFuelForm({ ...fuelForm, odometer: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="input-group">
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Litres *</span>
                {ocrExtractedData?.liters && (
                  <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 600 }}>✓ From Slip</span>
                )}
              </label>
              <input
                required
                type="number"
                min="0.1"
                step="0.01"
                className="input w-full"
                placeholder="40"
                value={fuelForm.liters}
                onChange={(e) => setFuelForm({ ...fuelForm, liters: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Amount (₹) *</span>
                {ocrExtractedData?.amount && (
                  <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 600 }}>✓ From Slip</span>
                )}
              </label>
              <input
                required
                type="number"
                min="1"
                step="0.01"
                className="input w-full"
                placeholder="3000"
                value={fuelForm.cost}
                onChange={(e) => setFuelForm({ ...fuelForm, cost: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="input-group">
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Bill / Receipt # (optional)</span>
                {ocrExtractedData?.bill_number && (
                  <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 600 }}>✓ From Slip</span>
                )}
              </label>
              <input
                type="text"
                className="input w-full"
                placeholder="e.g. INV-98124"
                value={fuelForm.invoice_number}
                onChange={(e) => setFuelForm({ ...fuelForm, invoice_number: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Receipt Photo URL (optional)</label>
              <input
                type="text"
                className="input w-full"
                placeholder="Receipt attachment"
                value={fuelForm.receipt_url}
                onChange={(e) => setFuelForm({ ...fuelForm, receipt_url: e.target.value })}
              />
            </div>
          </div>

          <div className="input-group mb-4">
            <label>Pump / Vendor (optional)</label>
            <input
              type="text"
              className="input w-full"
              placeholder="e.g. HP Petrol Pump, Ajmer Road"
              value={fuelForm.vendor}
              onChange={(e) => setFuelForm({ ...fuelForm, vendor: e.target.value })}
            />
          </div>

          <div className="input-group mb-4">
            <label>Trip (optional — auto-detected if during one)</label>
            <select
              className="select w-full"
              value={fuelForm.trip_id}
              onChange={(e) => setFuelForm({ ...fuelForm, trip_id: e.target.value })}
            >
              <option value="">Detect automatically</option>
              {trips
                .filter((t) => !fuelForm.vehicle_id || t.vehicle_id === fuelForm.vehicle_id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {tripCode(t.id)} · {t.origin} → {t.destination} · {t.status}
                  </option>
                ))}
            </select>
          </div>

          {/* Live Odometer & Tank sanity hints */}
          {(() => {
            const v = vehicles.find((veh) => String(veh.id) === String(fuelForm.vehicle_id));
            if (!v) return null;
            const prevOdo = Number(v.odometer) || 0;
            const tankCap = Number(v.fuel_tank_capacity) || 300;
            const odoVal = Number(fuelForm.odometer);
            const litresVal = Number(fuelForm.liters);
            const isOdoLow = odoVal > 0 && prevOdo > 0 && odoVal <= prevOdo;
            const isTankOver = litresVal > 0 && litresVal > tankCap;
            if (!isOdoLow && !isTankOver) return null;
            return (
              <div className="fe-form-warning mb-4">
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  {isOdoLow && (
                    <div>
                      Entered odometer ({odoVal.toLocaleString()} km) is ≤ vehicle's recorded odometer ({prevOdo.toLocaleString()} km). It will be flagged for review.
                    </div>
                  )}
                  {isTankOver && (
                    <div>
                      Entered quantity ({litresVal}L) exceeds vehicle's fuel tank capacity ({tankCap}L). It will be flagged for review.
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsFuelDrawerOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Log Fuel'}
            </button>
          </div>
        </form>
      </SideDrawer>

      {/* 5. SideDrawer: Add General Expense */}
      <SideDrawer
        isOpen={isExpenseDrawerOpen}
        onClose={() => setIsExpenseDrawerOpen(false)}
        title="Add Expense"
        subtitle="Record tolls, maintenance, insurance, permits, salary, garage, etc."
      >
        <form onSubmit={handleExpenseSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="input-group">
              <label>Category *</label>
              <select
                className="select w-full"
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
              >
                {ALL_CATEGORIES.filter((c) => c !== 'FUEL').map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>Vehicle *</label>
              <select
                required
                className="select w-full"
                value={expenseForm.vehicle_id}
                onChange={(e) => setExpenseForm({ ...expenseForm, vehicle_id: e.target.value })}
              >
                <option value="">Select vehicle…</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registration_number} ({v.type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="input-group mb-4">
            <label>Description *</label>
            <input
              required
              type="text"
              className="input w-full"
              placeholder="e.g. Brake pads + labour / Toll plaza fee"
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="input-group">
              <label>Date *</label>
              <input
                required
                type="date"
                className="input w-full"
                value={expenseForm.date}
                onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Amount (₹) *</label>
              <input
                required
                type="number"
                min="1"
                step="0.01"
                className="input w-full"
                placeholder="6500"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div className="input-group">
              <label>Vendor (optional)</label>
              <input
                type="text"
                className="input w-full"
                placeholder="e.g. Sharma Auto Works"
                value={expenseForm.vendor}
                onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Payment Mode</label>
              <select
                className="select w-full"
                value={expenseForm.payment_mode}
                onChange={(e) => setExpenseForm({ ...expenseForm, payment_mode: e.target.value })}
              >
                {['Cash', 'UPI', 'NEFT', 'IMPS', 'RTGS', 'Cheque', 'Bank Transfer', 'Fuel Card', 'Other'].map(
                  (m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsExpenseDrawerOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save Expense'}
            </button>
          </div>
        </form>
      </SideDrawer>

      {/* 6. Monthly Bill Modal */}
      {isBillModalOpen &&
        createPortal(
          <div
            className="modal-overlay"
            style={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(30, 20, 28, 0.45)' }}
            onClick={() => setIsBillModalOpen(false)}
          >
            <div
              className="modal-content"
              style={{ maxWidth: '680px', borderRadius: '12px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 className="heading text-xl">Monthly Bill</h3>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setIsBillModalOpen(false)}
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-muted mb-4">
                Full operating ledger breakdown for {monthLabel(billMonth)}. Export or download printable HTML document.
              </p>

              <div className="flex gap-3 mb-4 items-end">
                <div className="input-group flex-1">
                  <label>Select Month</label>
                  <input
                    type="month"
                    className="input w-full"
                    value={billMonth}
                    onChange={(e) => {
                      setBillMonth(e.target.value);
                      fetchMonthlyBill(e.target.value);
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => apiOpenDocument(`/expenses/monthly-bill/${billMonth}/download`)}
                  disabled={billLoading}
                >
                  Print / Preview
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    apiDownloadFile(`/expenses/monthly-bill/${billMonth}/download`, `expense-bill-${billMonth}.html`)
                  }
                  disabled={billLoading}
                >
                  Download
                </button>
              </div>

              {billLoading && <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--sub)' }}>Building {monthLabel(billMonth)}…</div>}
              {!billLoading && !billData && (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--sub)' }}>No data for {monthLabel(billMonth)}.</div>
              )}

              {!billLoading && billData && (
                <>
                  <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '6px', marginBottom: '1rem' }}>
                    <table className="dense-table">
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Entries</th>
                          <th>Litres</th>
                          <th>Odometer Span</th>
                          <th className="num">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billData.breakdown.length === 0 && (
                          <tr>
                            <td colSpan={5} style={{ textAlign: 'center', padding: '1rem', color: 'var(--sub)' }}>
                              No expenses logged in {monthLabel(billMonth)}.
                            </td>
                          </tr>
                        )}
                        {billData.breakdown.map((b) => (
                          <tr key={b.category}>
                            <td>
                              <span className="fe-pill fe-pill-maint">
                                {CATEGORY_LABELS[b.category] || b.category}
                              </span>
                            </td>
                            <td className="mono">{b.entry_count}</td>
                            <td className="mono">
                              {Number(b.litres) > 0 ? `${Number(b.litres).toLocaleString('en-IN')} L` : '—'}
                            </td>
                            <td className="mono">
                              {Number(b.first_odometer) > 0
                                ? `${Number(b.first_odometer).toLocaleString('en-IN')} – ${Number(b.last_odometer).toLocaleString('en-IN')}`
                                : '—'}
                            </td>
                            <td className="num" style={{ fontWeight: 600 }}>{formatCurrency(b.total_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--sub)' }}>
                      {billData.entries.length} line items ({billData.from_date} to {billData.to_date})
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      Total: {formatCurrency(billData.total)}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Review Modal for Flagged Fuel Claims */}
      {reviewModal.open && reviewModal.expense && createPortal(
        <div className="fe-modal-overlay" onClick={() => setReviewModal({ open: false, expense: null, notes: '' })}>
          <div className="fe-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="fe-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert size={18} color="#d97706" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Review Fuel Claim</h3>
              </div>
              <button
                type="button"
                className="fe-modal-close"
                onClick={() => setReviewModal({ open: false, expense: null, notes: '' })}
              >
                <X size={16} />
              </button>
            </div>
            <div className="fe-modal-body">
              <div className="fe-review-details-grid">
                <div>
                  <span className="fe-detail-label">Vehicle</span>
                  <b>{reviewModal.expense.vehicle_registration} ({reviewModal.expense.vehicle_kind})</b>
                </div>
                <div>
                  <span className="fe-detail-label">Date</span>
                  <b>{reviewModal.expense.expense_date}</b>
                </div>
                <div>
                  <span className="fe-detail-label">Claimed Amount</span>
                  <b style={{ color: '#d97706' }}>{formatCurrency(reviewModal.expense.amount)}</b>
                </div>
                <div>
                  <span className="fe-detail-label">Quantity</span>
                  <b>{reviewModal.expense.quantity ? `${reviewModal.expense.quantity} L` : '—'}</b>
                </div>
                <div>
                  <span className="fe-detail-label">Odometer</span>
                  <b>{reviewModal.expense.odometer ? `${Number(reviewModal.expense.odometer).toLocaleString('en-IN')} km` : '—'}</b>
                </div>
                <div>
                  <span className="fe-detail-label">Pump / Vendor</span>
                  <b>{reviewModal.expense.vendor || '—'}</b>
                </div>
                <div>
                  <span className="fe-detail-label">Receipt / Bill #</span>
                  <b>{reviewModal.expense.invoice_number ? `#${reviewModal.expense.invoice_number}` : 'None provided'}</b>
                </div>
                <div>
                  <span className="fe-detail-label">Trip</span>
                  <b>{reviewModal.expense.trip_id ? tripCode(reviewModal.expense.trip_id) : 'Unassigned'}</b>
                </div>
              </div>

              {/* Anomaly flags */}
              <div className="fe-flag-box">
                <div className="fe-flag-header">
                  <AlertTriangle size={14} color="#d97706" />
                  <b>Detected Anomaly Flags ({reviewModal.expense.flag_reasons?.length || 0})</b>
                </div>
                <ul className="fe-flag-list">
                  {reviewModal.expense.flag_reasons && reviewModal.expense.flag_reasons.length > 0 ? (
                    reviewModal.expense.flag_reasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))
                  ) : (
                    <li>Manual review requested for this entry.</li>
                  )}
                </ul>
              </div>

              {reviewModal.expense.receipt_url && (
                <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: 'var(--bg)', borderRadius: '6px' }}>
                  <span className="fe-detail-label">Receipt Document</span>
                  <a
                    href={reviewModal.expense.receipt_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.8rem', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
                  >
                    <ExternalLink size={12} /> Open original receipt image
                  </a>
                </div>
              )}

              <div className="input-group" style={{ marginTop: '1rem' }}>
                <label>Reviewer Notes / Verification Reason (optional)</label>
                <textarea
                  className="input w-full"
                  rows={2}
                  placeholder="e.g. Verified with driver; physical slip checked and matches pump records."
                  value={reviewModal.notes}
                  onChange={(e) => setReviewModal({ ...reviewModal, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="fe-modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setReviewModal({ open: false, expense: null, notes: '' })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => handleReview(reviewModal.expense.id, 'REJECT', reviewModal.notes)}
              >
                Reject Claim
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => handleReview(reviewModal.expense.id, 'APPROVE', reviewModal.notes)}
              >
                Approve Claim
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
