import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  FileText,
  Download,
  Trash2,
  AlertTriangle,
  RefreshCw,
  X,
  IndianRupee,
  Receipt,
  Check,
  Edit2,
  ChevronRight,
  ChevronDown,
  ShieldAlert,
  Clock
} from 'lucide-react';
import { apiRequest, apiOpenDocument } from '../utils/api';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { useConfirm } from '../contexts/ConfirmContext';
import PageToolbar from '../components/common/PageToolbar';
import StatStrip from '../components/common/StatStrip';
import SideDrawer from '../components/common/SideDrawer';
import './Billing.css';

const PAYMENT_MODES = ['Cash', 'UPI', 'NEFT', 'IMPS', 'RTGS', 'Cheque', 'Bank Transfer', 'Other'];
const CHARGE_KINDS = ['TOLL', 'LOADING', 'UNLOADING', 'DETENTION', 'DRIVER_ALLOWANCE', 'MISC'];
const DEFAULT_STATUSES = ['Completed'];
const INCLUDE_IN_PROGRESS_STATUSES = ['Completed', 'Dispatched', 'Assigned', 'Planned'];

function money(value) {
  const n = parseFloat(value || 0);
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(value) {
  if (!value) return '—';
  const plain = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (plain) return `${plain[3]}/${plain[2]}/${plain[1]}`;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('en-IN');
}

const today = () => new Date().toISOString().slice(0, 10);

function showToast(message) {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: message }));
}

function StatusChip({ status }) {
  if (status === 'Void') return <span className="pill pill-gray">VOID</span>;
  const cls =
    status === 'Paid'
      ? 'pill pill-green'
      : status === 'Partially Paid'
        ? 'pill pill-amber'
        : 'pill pill-red';
  return <span className={cls}>{status}</span>;
}

export default function Billing() {
  const { globalSearch } = useGlobalSearch();
  const confirm = useConfirm();

  const [companies, setCompanies] = useState([]);
  const [bills, setBills] = useState([]);
  const [ageing, setAgeing] = useState([]);
  const [showAgeing, setShowAgeing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Unpaid' | 'Partial' | 'Paid' | 'Void'
  const [companyId, setCompanyId] = useState(null);

  // Drawers
  const [isStatementDrawerOpen, setIsStatementDrawerOpen] = useState(false);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [openBill, setOpenBill] = useState(null);

  // Statement Preview state
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [includeInProgress, setIncludeInProgress] = useState(false);
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const [selectedChargeIds, setSelectedChargeIds] = useState([]);
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [chargeForm, setChargeForm] = useState({
    id: null,
    kind: 'TOLL',
    description: '',
    amount: '',
    charge_date: today()
  });

  // Bill payment form state
  const [payment, setPayment] = useState({ amount: '', mode: 'Cash', payment_date: today(), note: '' });

  // Register company form state
  const [companyForm, setCompanyForm] = useState({
    name: '',
    gstin: '',
    contact_person: '',
    phone: '',
    address: '',
    opening_balance: '',
    credit_limit: ''
  });

  const loadCompanies = useCallback(async () => {
    try {
      const res = await apiRequest('GET', '/billing/companies');
      setCompanies(res.data || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Could not load companies.');
    }
  }, []);

  const loadBills = useCallback(async () => {
    try {
      const res = await apiRequest('GET', '/billing/bills');
      setBills(res.data || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Could not load bills.');
    }
  }, []);

  const loadAgeing = useCallback(async () => {
    try {
      const res = await apiRequest('GET', '/billing/companies/ageing');
      setAgeing(res.data || []);
    } catch (err) {
      // Non-fatal — ageing panel just stays empty
      console.warn('Ageing load failed:', err.message);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadCompanies(), loadBills(), loadAgeing()]);
    setLoading(false);
  }, [loadCompanies, loadBills, loadAgeing]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const statuses = includeInProgress ? INCLUDE_IN_PROGRESS_STATUSES : DEFAULT_STATUSES;

  const loadPreview = useCallback(async (cId, inc) => {
    if (!cId) {
      setPreview(null);
      setSelectedTripIds([]);
      setSelectedChargeIds([]);
      return;
    }
    setPreviewLoading(true);
    try {
      const qs = (inc ? INCLUDE_IN_PROGRESS_STATUSES : DEFAULT_STATUSES).join(',');
      const res = await apiRequest('GET', `/billing/companies/${cId}/statement?statuses=${encodeURIComponent(qs)}`);
      setPreview(res.data);
      setSelectedTripIds((res.data.billable || []).map((t) => t.id));
      setSelectedChargeIds((res.data.charges?.billable || []).map((c) => c.id));
      setError(null);
    } catch (err) {
      setError(err.message || 'Could not load statement preview.');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (companyId) {
      loadPreview(companyId, includeInProgress);
    } else {
      setPreview(null);
    }
  }, [companyId, includeInProgress, loadPreview]);

  const selectedCompany = companies.find((c) => c.id === companyId);

  const toggleTrip = (tId) => {
    setSelectedTripIds((prev) =>
      prev.includes(tId) ? prev.filter((id) => id !== tId) : [...prev, tId]
    );
  };

  const toggleCharge = (cId) => {
    setSelectedChargeIds((prev) =>
      prev.includes(cId) ? prev.filter((id) => id !== cId) : [...prev, cId]
    );
  };

  const resetChargeForm = () => {
    setChargeForm({ id: null, kind: 'TOLL', description: '', amount: '', charge_date: today() });
  };

  const handleSaveCharge = async (e) => {
    e.preventDefault();
    if (!companyId || !chargeForm.description.trim() || !chargeForm.amount) return;
    setBusy(true);
    try {
      if (chargeForm.id) {
        await apiRequest('PATCH', `/billing/charges/${chargeForm.id}`, {
          kind: chargeForm.kind,
          description: chargeForm.description.trim(),
          amount: parseFloat(chargeForm.amount),
          charge_date: chargeForm.charge_date || undefined
        });
        showToast('Charge updated.');
      } else {
        await apiRequest('POST', `/billing/companies/${companyId}/charges`, {
          kind: chargeForm.kind,
          description: chargeForm.description.trim(),
          amount: parseFloat(chargeForm.amount),
          charge_date: chargeForm.charge_date || undefined
        });
        showToast('Charge added to statement.');
      }
      resetChargeForm();
      await loadPreview(companyId, includeInProgress);
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCharge = async (charge) => {
    const ok = await confirm({
      title: 'Remove Charge',
      message: `Remove "${charge.description}" (${money(charge.amount)}) from the statement?`,
      confirmText: 'Remove Charge',
      variant: 'danger'
    });
    if (!ok) return;

    setBusy(true);
    try {
      await apiRequest('DELETE', `/billing/charges/${charge.id}`);
      showToast('Charge removed.');
      if (chargeForm.id === charge.id) resetChargeForm();
      await loadPreview(companyId, includeInProgress);
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleIssueStatement = async () => {
    if (!companyId) return;
    const trips = preview?.billable || [];
    const charges = preview?.charges?.billable || [];
    if (selectedTripIds.length + selectedChargeIds.length === 0) {
      showToast('Nothing selected to issue.');
      return;
    }

    const companyName = selectedCompany?.name || 'this customer';
    const totalLines = selectedTripIds.length + selectedChargeIds.length;
    const ok = await confirm({
      title: `Issue Statement (${totalLines} items)`,
      message: `Generate official numbered invoice for ${companyName}? This closes out the current pending items into a finalized bill.`,
      confirmText: 'Generate Bill',
      variant: 'info'
    });
    if (!ok) return;

    setBusy(true);
    try {
      const allTrips = selectedTripIds.length === trips.length;
      const allCharges = selectedChargeIds.length === charges.length;
      const res = await apiRequest('POST', `/billing/companies/${companyId}/statement/issue`, {
        note: note.trim() || undefined,
        due_date: dueDate || undefined,
        statuses,
        trip_ids: allTrips ? undefined : selectedTripIds,
        charge_ids: allCharges ? undefined : selectedChargeIds
      });
      showToast(`Statement ${res.data.bill_no} issued.`);
      setNote('');
      setDueDate('');
      setIsStatementDrawerOpen(false);
      await refreshAll();
      setOpenBill(res.data);
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenBill = async (id) => {
    try {
      const res = await apiRequest('GET', `/billing/bills/${id}`);
      setOpenBill(res.data);
      setPayment({ amount: '', mode: 'Cash', payment_date: today(), note: '' });
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    if (!openBill) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', `/billing/bills/${openBill.id}/payments`, {
        amount: parseFloat(payment.amount),
        mode: payment.mode,
        payment_date: payment.payment_date || undefined,
        note: payment.note.trim() || undefined
      });
      setOpenBill(res.data);
      setPayment({ amount: '', mode: payment.mode, payment_date: today(), note: '' });
      showToast(`Payment recorded. Outstanding ${money(res.data.remaining_balance)}.`);
      await refreshAll();
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleVoid = async (bill) => {
    const reason = await confirm({
      title: `Void Bill ${bill.bill_no}`,
      message: 'Its trips and charges return to the open statement, and the invoice number permanently stays on record as VOID for audit compliance.',
      confirmText: 'Void Bill',
      variant: 'danger',
      inputPrompt: {
        label: 'Audit Reason (optional)',
        placeholder: 'Reason for voiding (e.g. rate correction, customer dispute)...',
        required: false
      }
    });
    if (reason === null) return;
    setBusy(true);
    try {
      await apiRequest('DELETE', `/billing/bills/${bill.id}`, { reason: reason ? reason.trim() || null : null });
      showToast(`${bill.bill_no} voided — kept on record as VOID.`);
      setOpenBill(null);
      await refreshAll();
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (bill) => {
    try {
      await apiOpenDocument(`/billing/bills/${bill.id}/download`);
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    if (!companyForm.name.trim()) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', '/billing/companies', {
        name: companyForm.name.trim(),
        gstin: companyForm.gstin.trim() || undefined,
        contact_person: companyForm.contact_person.trim() || undefined,
        phone: companyForm.phone.trim() || undefined,
        address: companyForm.address.trim() || undefined,
        opening_balance: companyForm.opening_balance ? parseFloat(companyForm.opening_balance) : 0,
        credit_limit: companyForm.credit_limit ? parseFloat(companyForm.credit_limit) : undefined
      });
      showToast(`Company ${res.data.name} added.`);
      setCompanyForm({ name: '', gstin: '', contact_person: '', phone: '', address: '', opening_balance: '', credit_limit: '' });
      setShowCompanyForm(false);
      await loadCompanies();
      setCompanyId(res.data.id);
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  // Calculations & filtering
  const query = (globalSearch || '').toLowerCase();
  const visibleCompanies = companies.filter((c) => c.name.toLowerCase().includes(query));

  const filteredBills = bills.filter((b) => {
    if (companyId && b.company_id !== companyId) return false;
    if (statusFilter !== 'All') {
      if (statusFilter === 'Unpaid' && b.status !== 'Unpaid') return false;
      if (statusFilter === 'Partial' && b.status !== 'Partially Paid') return false;
      if (statusFilter === 'Paid' && b.status !== 'Paid') return false;
      if (statusFilter === 'Void' && b.status !== 'Void') return false;
    }
    if (query) {
      return b.bill_no.toLowerCase().includes(query) || (b.company_name || '').toLowerCase().includes(query);
    }
    return true;
  });

  const totalOutstanding = filteredBills
    .filter((b) => b.status !== 'Void')
    .reduce((sum, b) => sum + parseFloat(b.remaining_balance || 0), 0);

  const totalUnbilledTrips = companies.reduce((sum, c) => sum + Number(c.unbilled_trip_count || 0), 0);
  const totalUnbilledAmount = companies.reduce((sum, c) => sum + parseFloat(c.unbilled_amount || 0), 0);
  const allCompaniesOutstanding = companies.reduce((sum, c) => sum + parseFloat(c.outstanding_balance || 0), 0);

  const pool = preview || { billable: [], waiting: [], unpriced: [], totals: {}, projected: {} };
  const ledger = preview?.ledger || {
    previous_balance: preview?.previous_balance || 0,
    fares: preview?.projected?.subtotal || 0,
    charges: preview?.projected?.charges_total || 0,
    advances: preview?.projected?.total_advance || 0,
    closing_balance: preview?.projected?.balance_due || 0
  };
  const pendingCharges = preview?.charges?.billable || [];
  const selectedFares = (pool.billable || [])
    .filter((t) => selectedTripIds.includes(t.id))
    .reduce((sum, t) => sum + parseFloat(t.revenue || 0), 0);
  const selectedChargeTotal = pendingCharges
    .filter((c) => selectedChargeIds.includes(c.id))
    .reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);

  // Check if active selected customer has unbilled items
  const hasUnbilled = selectedCompany && (Number(selectedCompany.unbilled_trip_count) > 0 || (pool.billable && pool.billable.length > 0));

  return (
    <div className="billing-page fade-in">
      {/* 1. Single-Row Page Toolbar */}
      <PageToolbar
        title="Billing"
        tooltip="Customer accounts, unbilled trips and issued statements."
        actions={
          <>
            <button
              className="btn btn-outline"
              onClick={refreshAll}
              disabled={loading || busy}
              title="Refresh bills"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setShowCompanyForm(true)}
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
            >
              <Plus size={14} /> Add company
            </button>
          </>
        }
      >
        {/* Customer Filter Dropdown */}
        <select
          className="select"
          style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', minWidth: '170px' }}
          value={companyId || ''}
          onChange={(e) => setCompanyId(e.target.value || null)}
        >
          <option value="">All Customers ({companies.length})</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {Number(c.unbilled_trip_count) > 0 ? `(${c.unbilled_trip_count} unbilled)` : ''}
            </option>
          ))}
        </select>

        {/* Status Filter Chips */}
        <div className="filter-chips-row">
          {['All', 'Unpaid', 'Partial', 'Paid', 'Void'].map((s) => (
            <button
              key={s}
              type="button"
              className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'All' ? 'All Status' : s}
            </button>
          ))}
        </div>
      </PageToolbar>

      {/* 2. Compact StatStrip */}
      <StatStrip
        items={[
          { label: 'Total Outstanding', value: money(allCompaniesOutstanding), color: allCompaniesOutstanding > 0 ? 'var(--red)' : undefined },
          { label: 'Customers', value: companies.length },
          { label: 'Unbilled Trips', value: `${totalUnbilledTrips} (${money(totalUnbilledAmount)})`, isDimmed: totalUnbilledTrips === 0 },
          { label: 'Statements', value: bills.length }
        ]}
      />

      {error && (
        <div className="billing-error" style={{ marginBottom: '0.5rem' }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* 3. Main Split: Customers Left Rail + Dense Bills Table Area */}
      <div className="billing-layout-container">
        {/* Left Rail: Customers */}
        <aside className="billing-rail">
          <div className="billing-rail-head">
            <span>Customers ({companies.length})</span>
            {companyId && (
              <button
                type="button"
                className="link-btn"
                style={{ fontSize: '0.7rem' }}
                onClick={() => setCompanyId(null)}
              >
                Clear
              </button>
            )}
          </div>

          <div className="billing-rail-list">
            <button
              type="button"
              className={`rail-item ${!companyId ? 'active' : ''}`}
              onClick={() => setCompanyId(null)}
            >
              <div className="rail-item-name">All Customers</div>
              <div className="rail-item-sub">
                <span>{companies.length} accounts</span>
                <span className={allCompaniesOutstanding > 0 ? 'rail-due' : ''}>
                  {money(allCompaniesOutstanding)}
                </span>
              </div>
            </button>

            {visibleCompanies.map((c) => {
              const owes = Number(c.outstanding_balance) || 0;
              const unbilled = Number(c.unbilled_trip_count) || 0;
              const creditLimit = c.credit_limit !== null && c.credit_limit !== undefined ? parseFloat(c.credit_limit) : null;
              const overLimit = creditLimit !== null && owes > creditLimit;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`rail-item ${companyId === c.id ? 'active' : ''}`}
                  onClick={() => setCompanyId(c.id)}
                  title={`${c.name} · ${unbilled} unbilled trips · Owes ${money(owes)}${overLimit ? ' · CREDIT LIMIT EXCEEDED' : ''}`}
                >
                  <div className="rail-item-name">
                    {c.name}
                    {overLimit && (
                      <span className="credit-breach-badge" title={`Exceeds credit limit of ${money(creditLimit)}`}>
                        <ShieldAlert size={11} /> Over limit
                      </span>
                    )}
                  </div>
                  <div className="rail-item-sub">
                    <span>{unbilled > 0 ? `${unbilled} unbilled` : '0 unbilled'}</span>
                    <span className={owes > 0 ? 'rail-due' : ''}>
                      {money(owes)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Main Area */}
        <main className="billing-main-area">
          {/* Conditional Slim Unbilled Trips Strip */}
          {hasUnbilled && (
            <div className="unbilled-strip">
              <div className="unbilled-strip-left">
                <Receipt size={16} />
                <span>
                  <b>{selectedCompany.name}</b> has {selectedCompany.unbilled_trip_count || pool.billable.length} unbilled trips ({money(selectedCompany.unbilled_amount || pool.totals?.billable_amount)}) ready for invoicing.
                </span>
              </div>
              <div className="unbilled-strip-actions">
                <button
                  type="button"
                  className="unbilled-strip-btn"
                  onClick={() => setIsStatementDrawerOpen(true)}
                >
                  <FileText size={14} /> Review & Issue Statement <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Ageing Report Panel */}
          {ageing.length > 0 && (
            <div className="ageing-panel">
              <button
                type="button"
                className="ageing-panel-header"
                onClick={() => setShowAgeing((v) => !v)}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Clock size={14} />
                  <b>Receivables Ageing</b>
                  <span className="ageing-badge">{ageing.length} clients · {money(ageing.reduce((s, a) => s + parseFloat(a.total_outstanding || 0), 0))}</span>
                </span>
                <ChevronDown size={14} style={{ transform: showAgeing ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
              {showAgeing && (
                <div className="ageing-table-wrap">
                  <table className="dense-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th className="num">Current</th>
                        <th className="num ageing-col-mild">1–15 days</th>
                        <th className="num ageing-col-warn">16–30 days</th>
                        <th className="num ageing-col-danger">31–60 days</th>
                        <th className="num ageing-col-critical">60+ days</th>
                        <th className="num">Total</th>
                        <th>Credit Limit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ageing.map((a) => {
                        const lim = a.credit_limit !== null ? parseFloat(a.credit_limit) : null;
                        const total = parseFloat(a.total_outstanding || 0);
                        const overLimit = lim !== null && total > lim;
                        return (
                          <tr key={a.id} className={overLimit ? 'ageing-row-breach' : ''}>
                            <td>
                              <button
                                type="button"
                                className="link-btn"
                                style={{ fontWeight: 600, textAlign: 'left' }}
                                onClick={() => setCompanyId(a.id)}
                              >
                                {a.name}
                              </button>
                              {overLimit && <span className="ageing-overlimit-tag"><ShieldAlert size={10} /> Over limit</span>}
                            </td>
                            <td className="num">{parseFloat(a.current_amt) > 0 ? money(a.current_amt) : '—'}</td>
                            <td className="num ageing-col-mild">{parseFloat(a.days_1_15) > 0 ? money(a.days_1_15) : '—'}</td>
                            <td className="num ageing-col-warn">{parseFloat(a.days_16_30) > 0 ? money(a.days_16_30) : '—'}</td>
                            <td className="num ageing-col-danger">{parseFloat(a.days_31_60) > 0 ? money(a.days_31_60) : '—'}</td>
                            <td className="num ageing-col-critical">{parseFloat(a.days_60plus) > 0 ? money(a.days_60plus) : '—'}</td>
                            <td className="num" style={{ fontWeight: 700 }}>{money(total)}</td>
                            <td style={{ fontSize: '0.77rem', color: overLimit ? 'var(--red)' : 'var(--sub)' }}>
                              {lim !== null ? money(lim) : <span style={{ color: 'var(--sub)' }}>—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Bills Table: Starts at y≈170 */}
          <div className="dense-table-wrapper">
            <div className="dense-table-scroll">
              <table className="dense-table">
                <thead>
                  <tr>
                    <th>Bill No</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th className="num">Previous</th>
                    <th className="num">Fares</th>
                    <th className="num">Advance</th>
                    <th className="num">Outstanding</th>
                    <th>Status</th>
                    <th style={{ width: '90px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--sub)' }}>
                        Loading statements…
                      </td>
                    </tr>
                  )}
                  {!loading && filteredBills.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--sub)' }}>
                        No statements matching current filters.
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    filteredBills.map((b) => (
                      <tr key={b.id} className={b.status === 'Void' ? 'row-void' : ''}>
                        <td className="mono" style={{ fontWeight: 600 }}>{b.bill_no}</td>
                        <td>{b.company_name}</td>
                        <td>{fmtDate(b.bill_date)}</td>
                        <td className="num">{money(b.previous_balance)}</td>
                        <td className="num">{money(b.subtotal)}</td>
                        <td className="num">{money(b.total_advance)}</td>
                        <td className="num" style={{ fontWeight: 700, color: Number(b.remaining_balance) > 0 ? 'var(--red)' : undefined }}>
                          {money(b.remaining_balance)}
                        </td>
                        <td>
                          <StatusChip status={b.status} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '0.2rem' }}>
                            <button
                              type="button"
                              className="row-menu-btn"
                              title="View statement details"
                              onClick={() => handleOpenBill(b.id)}
                            >
                              <Receipt size={14} />
                            </button>
                            <button
                              type="button"
                              className="row-menu-btn"
                              title="Download PDF statement"
                              onClick={() => handleDownload(b)}
                            >
                              <Download size={14} />
                            </button>
                            {b.status !== 'Void' && (
                              <button
                                type="button"
                                className="row-menu-btn"
                                style={{ color: 'var(--red)' }}
                                title="Void statement"
                                onClick={() => handleVoid(b)}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'right' }}>
                      Filtered Outstanding Total:
                    </td>
                    <td className="num" style={{ color: totalOutstanding > 0 ? 'var(--red)' : undefined }}>
                      {money(totalOutstanding)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* 4. SideDrawer: Register Customer */}
      <SideDrawer
        isOpen={showCompanyForm}
        onClose={() => setShowCompanyForm(false)}
        title="Register Customer"
        subtitle="Add a client company to generate trips and invoices"
      >
        <form onSubmit={handleCreateCompany} id="company-form">
          <div className="input-group mb-4">
            <label>Company name *</label>
            <input
              className="input w-full"
              value={companyForm.name}
              onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
              placeholder="e.g. Sharma Logistics"
              required
            />
          </div>
          <div className="input-group mb-4">
            <label>GSTIN</label>
            <input
              className="input w-full"
              value={companyForm.gstin}
              onChange={(e) => setCompanyForm({ ...companyForm, gstin: e.target.value })}
              placeholder="27AAACR5055K1Z5"
            />
          </div>
          <div className="input-group mb-4">
            <label>Contact person</label>
            <input
              className="input w-full"
              value={companyForm.contact_person}
              onChange={(e) => setCompanyForm({ ...companyForm, contact_person: e.target.value })}
            />
          </div>
          <div className="input-group mb-4">
            <label>Phone</label>
            <input
              className="input w-full"
              value={companyForm.phone}
              onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
            />
          </div>
          <div className="input-group mb-4">
            <label>Address</label>
            <input
              className="input w-full"
              value={companyForm.address}
              onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
            />
          </div>
          <div className="input-group mb-4">
            <label>Opening balance (₹ owed before TransitOps)</label>
            <input
              type="number"
              className="input w-full"
              value={companyForm.opening_balance}
              onChange={(e) => setCompanyForm({ ...companyForm, opening_balance: e.target.value })}
              placeholder="0"
            />
          </div>
          <div className="input-group mb-4">
            <label>Credit limit (₹) — max outstanding allowed</label>
            <input
              type="number"
              min="0"
              step="1000"
              className="input w-full"
              value={companyForm.credit_limit}
              onChange={(e) => setCompanyForm({ ...companyForm, credit_limit: e.target.value })}
              placeholder="Leave blank for no limit"
            />
            <span style={{ fontSize: '0.72rem', color: 'var(--sub)', marginTop: '0.25rem', display: 'block' }}>
              You'll see a warning before issuing new trips if the client exceeds this.
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setShowCompanyForm(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Add company
            </button>
          </div>
        </form>
      </SideDrawer>

      {/* 5. SideDrawer: Statement Builder (Unbilled Trips & Charges) */}
      <SideDrawer
        isOpen={isStatementDrawerOpen}
        onClose={() => setIsStatementDrawerOpen(false)}
        title={`Issue Statement · ${preview?.company?.name || selectedCompany?.name || ''}`}
        subtitle="Review unbilled trips, ledger statement and add manual charges"
        width="540px"
      >
        {previewLoading && <p className="muted-note">Loading statement preview…</p>}

        {!previewLoading && preview && (
          <div>
            {/* Credit limit breach warning */}
            {preview?.credit_limit_breach && (
              <div className="credit-breach-warning">
                <ShieldAlert size={15} />
                <span>
                  <b>Credit limit breach:</b> {preview?.company?.name} owes {money(preview?.ledger?.closing_balance)}, which exceeds their credit limit of {money(preview?.credit_limit)}.
                  You can still issue the statement, but consider collecting before dispatching new trips.
                </span>
              </div>
            )}

            {/* Ledger breakdown */}
            <div className="ledger-block mb-4">
              <div className="ledger-row">
                <span>Previous balance (issued, not yet settled)</span>
                <span className="num">{money(ledger.previous_balance)}</span>
              </div>
              <div className="ledger-row">
                <span>Fares this period ({pool.billable.length} trips)</span>
                <span className="num">{money(ledger.fares)}</span>
              </div>
              <div className="ledger-row">
                <span>Other charges ({pendingCharges.length})</span>
                <span className="num">{money(ledger.charges)}</span>
              </div>
              <div className="ledger-row">
                <span>Less: advances received</span>
                <span className="num">− {money(ledger.advances)}</span>
              </div>
              <div className="ledger-row closing">
                <span>Closing balance</span>
                <span className="num">{money(ledger.closing_balance)}</span>
              </div>
            </div>

            {/* Billable Trips list */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <h4 className="heading text-sm">Billable Trips ({pool.billable.length})</h4>
                <label className="toggle-inline" style={{ fontSize: '0.75rem' }}>
                  <input
                    type="checkbox"
                    checked={includeInProgress}
                    onChange={(e) => setIncludeInProgress(e.target.checked)}
                  />
                  Include in-progress
                </label>
              </div>

              {pool.billable.length === 0 ? (
                <p className="muted-note">No billable completed trips.</p>
              ) : (
                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '6px' }}>
                  <table className="dense-table">
                    <thead>
                      <tr>
                        <th style={{ width: '30px' }} />
                        <th>Date</th>
                        <th>Route</th>
                        <th className="num">Fare</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pool.billable.map((t) => (
                        <tr key={t.id} className={selectedTripIds.includes(t.id) ? '' : 'row-muted'}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedTripIds.includes(t.id)}
                              onChange={() => toggleTrip(t.id)}
                            />
                          </td>
                          <td>{fmtDate(t.trip_date)}</td>
                          <td>{t.origin} → {t.destination}</td>
                          <td className="num">{money(t.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Other Charges */}
            <div className="mb-4">
              <h4 className="heading text-sm mb-2">Other Charges ({pendingCharges.length})</h4>
              {pendingCharges.length > 0 && (
                <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '6px', marginBottom: '0.75rem' }}>
                  <table className="dense-table">
                    <thead>
                      <tr>
                        <th style={{ width: '30px' }} />
                        <th>Desc</th>
                        <th>Type</th>
                        <th className="num">Amount</th>
                        <th style={{ width: '40px' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {pendingCharges.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedChargeIds.includes(c.id)}
                              onChange={() => toggleCharge(c.id)}
                            />
                          </td>
                          <td>{c.description}</td>
                          <td>{String(c.kind || 'MISC').replace(/_/g, ' ')}</td>
                          <td className="num">{money(c.amount)}</td>
                          <td>
                            <button
                              type="button"
                              className="icon-btn billing-icon-danger"
                              onClick={() => handleDeleteCharge(c)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add charge mini form */}
              <form onSubmit={handleSaveCharge} style={{ background: 'var(--bg)', padding: '0.65rem', borderRadius: '6px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    type="date"
                    className="input"
                    style={{ fontSize: '0.78rem' }}
                    value={chargeForm.charge_date}
                    onChange={(e) => setChargeForm({ ...chargeForm, charge_date: e.target.value })}
                  />
                  <select
                    className="select"
                    style={{ fontSize: '0.78rem' }}
                    value={chargeForm.kind}
                    onChange={(e) => setChargeForm({ ...chargeForm, kind: e.target.value })}
                  >
                    {CHARGE_KINDS.map((k) => (
                      <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '0.5rem' }}>
                  <input
                    className="input"
                    style={{ fontSize: '0.78rem' }}
                    placeholder="Description (e.g. Toll)"
                    value={chargeForm.description}
                    onChange={(e) => setChargeForm({ ...chargeForm, description: e.target.value })}
                  />
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    style={{ fontSize: '0.78rem' }}
                    placeholder="₹ 0.00"
                    value={chargeForm.amount}
                    onChange={(e) => setChargeForm({ ...chargeForm, amount: e.target.value })}
                  />
                  <button type="submit" className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>
                    <Plus size={13} /> Add
                  </button>
                </div>
              </form>
            </div>

            {/* Note, Due Date & Action */}
            <div className="input-group mb-4">
              <label>Statement Note (optional)</label>
              <input
                className="input w-full"
                placeholder="e.g. Due within 15 days"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="input-group mb-4">
              <label>Payment Due Date (optional — defaults to net 30)</label>
              <input
                type="date"
                className="input w-full"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--sub)' }}>
                {selectedTripIds.length} trips · {selectedChargeIds.length} charges selected
              </span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleIssueStatement}
                disabled={busy || selectedTripIds.length + selectedChargeIds.length === 0}
              >
                <FileText size={15} /> Issue Statement
              </button>
            </div>
          </div>
        )}
      </SideDrawer>

      {/* 6. SideDrawer: Bill Detail & Payments (existing feature maintained) */}
      {openBill && (
        <div className="drawer-overlay" onClick={() => setOpenBill(null)}>
          <div className="drawer-content bill-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3 className="heading text-lg">
                  {openBill.bill_no} <StatusChip status={openBill.status} />
                </h3>
                <p className="muted-note">
                  {openBill.company_name} · {fmtDate(openBill.bill_date)}
                </p>
              </div>
              <button className="drawer-close" onClick={() => setOpenBill(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="drawer-body">
              {openBill.status === 'Void' && (
                <div className="void-banner-drawer">
                  <b>VOID:</b> This statement was voided. Kept on record for audit compliance.
                </div>
              )}

              {/* Balances */}
              <div className="ledger-block">
                <div className="ledger-row">
                  <span>Previous balance</span>
                  <span className="num">{money(openBill.previous_balance)}</span>
                </div>
                <div className="ledger-row">
                  <span>Fares</span>
                  <span className="num">{money(openBill.subtotal)}</span>
                </div>
                <div className="ledger-row">
                  <span>Charges</span>
                  <span className="num">{money(openBill.charges_total)}</span>
                </div>
                <div className="ledger-row">
                  <span>Less: advances</span>
                  <span className="num">− {money(openBill.total_advance)}</span>
                </div>
                <div className="ledger-row closing">
                  <span>Total statement balance</span>
                  <span className="num">{money(openBill.total_amount)}</span>
                </div>
                <div className="ledger-row">
                  <span>Payments received</span>
                  <span className="num">− {money(openBill.paid_amount)}</span>
                </div>
                <div className="ledger-row closing">
                  <span>Outstanding now</span>
                  <span className="num">{money(openBill.remaining_balance)}</span>
                </div>
              </div>

              {/* Record Payment Form */}
              {openBill.status !== 'Paid' && openBill.status !== 'Void' && (
                <form className="payment-form" onSubmit={handlePayment} style={{ marginTop: '1.25rem' }}>
                  <h4 className="heading text-sm mb-2">Record a payment</h4>
                  <div className="form-row-2">
                    <div className="field-wrap">
                      <label className="field-label">Amount (₹) *</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input"
                        value={payment.amount}
                        onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
                        placeholder={openBill.remaining_balance}
                        required
                      />
                    </div>
                    <div className="field-wrap">
                      <label className="field-label">Mode</label>
                      <select
                        className="input"
                        value={payment.mode}
                        onChange={(e) => setPayment({ ...payment, mode: e.target.value })}
                      >
                        {PAYMENT_MODES.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="form-row-2">
                    <div className="field-wrap">
                      <label className="field-label">Payment date</label>
                      <input
                        type="date"
                        className="input"
                        value={payment.payment_date}
                        onChange={(e) => setPayment({ ...payment, payment_date: e.target.value })}
                      />
                    </div>
                    <div className="field-wrap">
                      <label className="field-label">Note / reference</label>
                      <input
                        className="input"
                        value={payment.note}
                        onChange={(e) => setPayment({ ...payment, note: e.target.value })}
                        placeholder="e.g. UTR / Cheque #"
                      />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={busy || !payment.amount}>
                      Record payment
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
