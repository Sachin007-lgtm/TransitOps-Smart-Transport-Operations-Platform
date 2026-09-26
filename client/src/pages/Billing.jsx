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
  Edit2
} from 'lucide-react';
import { apiRequest, apiOpenDocument } from '../utils/api';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import './Billing.css';

const PAYMENT_MODES = ['Cash', 'UPI', 'NEFT', 'IMPS', 'RTGS', 'Cheque', 'Bank Transfer', 'Other'];

// Charge types that can ride on a statement. The API enforces the same list.
const CHARGE_KINDS = ['TOLL', 'LOADING', 'UNLOADING', 'DETENTION', 'DRIVER_ALLOWANCE', 'MISC'];

// Trips a bill is composed from. Completed is the rule: a fare is only owed
// once the work is done. The wider list behind the override tick exists for
// the cases the owner knows are finished but has not closed in the app yet.
const DEFAULT_STATUSES = ['Completed'];
const INCLUDE_IN_PROGRESS_STATUSES = ['Completed', 'Dispatched', 'Assigned', 'Planned'];

function money(value) {
  const n = parseFloat(value || 0);
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Dates arrive as plain 'YYYY-MM-DD' from the billing API; formatting them
// directly avoids the off-by-one that comes from parsing them as UTC.
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
  // Void is a state of the document, not a payment situation — it gets its own
  // neutral chip so it never reads as "still owed".
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

  const [companies, setCompanies] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Selected company + the pool of trips a bill would be composed from.
  const [companyId, setCompanyId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [includeInProgress, setIncludeInProgress] = useState(false);
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const [selectedChargeIds, setSelectedChargeIds] = useState([]);
  const [note, setNote] = useState('');
  // The charge form doubles as the editor: editingChargeId set means the same
  // fields are updating an existing (still unbilled) charge.
  const [chargeForm, setChargeForm] = useState({
    id: null,
    kind: 'TOLL',
    description: '',
    amount: '',
    charge_date: today()
  });

  // Bill detail drawer.
  const [openBill, setOpenBill] = useState(null);
  const [payment, setPayment] = useState({ amount: '', mode: 'Cash', payment_date: today(), note: '' });

  // Register a new customer.
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [companyForm, setCompanyForm] = useState({
    name: '',
    gstin: '',
    contact_person: '',
    phone: '',
    address: '',
    opening_balance: ''
  });

  const statuses = includeInProgress ? INCLUDE_IN_PROGRESS_STATUSES : DEFAULT_STATUSES;

  const loadCompanies = useCallback(async () => {
    const res = await apiRequest('GET', '/billing/companies');
    setCompanies(res.data || []);
  }, []);

  const loadBills = useCallback(async () => {
    const res = await apiRequest('GET', '/billing/bills');
    setBills(res.data || []);
  }, []);

  const loadPreview = useCallback(async (id, statusList) => {
    if (!id) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await apiRequest(
        'GET',
        `/billing/companies/${id}/unbilled?statuses=${statusList.join(',')}`
      );
      setPreview(res.data);
      // Default to billing everything that is ready; the owner can untick rows.
      setSelectedTripIds((res.data.billable || []).map((t) => t.id));
      setSelectedChargeIds((res.data.charges?.billable || []).map((c) => c.id));
    } catch (err) {
      setError(err.message);
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadCompanies(), loadBills()]);
        setError(null);
      } catch (err) {
        setError(err.message || 'Failed to load billing data.');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadCompanies, loadBills]);

  useEffect(() => {
    loadPreview(companyId, statuses);
    // `statuses` is derived from includeInProgress; keeping it out of the
    // dependency list would leave stale trip lists after the toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, includeInProgress, loadPreview]);

  const refreshAll = async () => {
    await Promise.all([loadCompanies(), loadBills()]);
    if (companyId) await loadPreview(companyId, statuses);
  };

  const toggleTrip = (id) => {
    setSelectedTripIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  };

  const toggleCharge = (id) => {
    setSelectedChargeIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  };

  const resetChargeForm = () =>
    setChargeForm({ id: null, kind: 'TOLL', description: '', amount: '', charge_date: today() });

  // Add a charge to the open statement, or save the one being edited.
  const handleSaveCharge = async (e) => {
    e.preventDefault();
    if (!companyId || !chargeForm.description.trim() || !chargeForm.amount) return;

    setBusy(true);
    try {
      const body = {
        description: chargeForm.description.trim(),
        amount: parseFloat(chargeForm.amount),
        kind: chargeForm.kind,
        charge_date: chargeForm.charge_date || undefined
      };
      if (chargeForm.id) {
        await apiRequest('PATCH', `/billing/charges/${chargeForm.id}`, body);
        showToast('Charge updated.');
      } else {
        await apiRequest('POST', `/billing/companies/${companyId}/charges`, body);
        showToast('Charge added to the open statement.');
      }
      resetChargeForm();
      await loadPreview(companyId, statuses);
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCharge = async (charge) => {
    if (!window.confirm(`Remove "${charge.description}" from the open statement?`)) return;
    setBusy(true);
    try {
      await apiRequest('DELETE', `/billing/charges/${charge.id}`);
      showToast('Charge removed.');
      if (chargeForm.id === charge.id) resetChargeForm();
      await loadPreview(companyId, statuses);
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Issue the open statement: one action that turns everything pending into a
   * numbered document. Nothing here can raise a half-statement by accident —
   * everything pending is included unless the owner unticked a line.
   */
  const handleIssueStatement = async () => {
    if (!companyId) return;
    const trips = preview?.billable || [];
    const charges = preview?.charges?.billable || [];
    if (selectedTripIds.length + selectedChargeIds.length === 0) {
      showToast('Nothing selected to issue.');
      return;
    }

    setBusy(true);
    try {
      const allTrips = selectedTripIds.length === trips.length;
      const allCharges = selectedChargeIds.length === charges.length;
      const res = await apiRequest('POST', `/billing/companies/${companyId}/statement/issue`, {
        note: note.trim() || undefined,
        statuses,
        trip_ids: allTrips ? undefined : selectedTripIds,
        charge_ids: allCharges ? undefined : selectedChargeIds
      });
      showToast(`Statement ${res.data.bill_no} issued.`);
      setNote('');
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
    // The number is kept (a GST series must not have unexplained gaps), so the
    // reason is captured as part of the audit trail.
    const reason = window.prompt(
      `Void ${bill.bill_no}?\n\nIts trips and charges go back to the open statement, and the number stays on record as VOID.\n\nReason (optional):`,
      ''
    );
    if (reason === null) return;
    setBusy(true);
    try {
      await apiRequest('DELETE', `/billing/bills/${bill.id}`, { reason: reason.trim() || null });
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
        opening_balance: companyForm.opening_balance ? parseFloat(companyForm.opening_balance) : 0
      });
      showToast(`Company ${res.data.name} added.`);
      setCompanyForm({ name: '', gstin: '', contact_person: '', phone: '', address: '', opening_balance: '' });
      setShowCompanyForm(false);
      await loadCompanies();
      setCompanyId(res.data.id);
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const query = globalSearch.toLowerCase();
  const visibleCompanies = companies.filter((c) => c.name.toLowerCase().includes(query));
  const visibleBills = bills.filter(
    (b) => b.bill_no.toLowerCase().includes(query) || (b.company_name || '').toLowerCase().includes(query)
  );

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
  // Newest bill for the selected customer (the list arrives newest first) —
  // shown in the "all caught up" state so the owner can jump to what is owed.
  const latestBill = companyId ? bills.find((b) => b.company_id === companyId) : null;

  return (
    <div className="billing-page">
      <header className="page-header-row">
        <div>
          <h1 className="text-2xl heading">Billing</h1>
          <p className="page-subtitle">
            Each customer has one open statement: it always shows their unbilled trips and charges, and
            issuing it turns them into a numbered document.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline" onClick={refreshAll} disabled={loading || busy}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setShowCompanyForm((v) => !v)}>
            <Plus size={15} /> Add company
          </button>
        </div>
      </header>

      {error && (
        <div className="billing-error">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {showCompanyForm && (
        <form className="card company-form" onSubmit={handleCreateCompany}>
          <h2 className="heading text-lg">Register a customer</h2>
          <div className="form-row-2">
            <div className="field-wrap">
              <label className="field-label">Company name *</label>
              <input
                className="input"
                value={companyForm.name}
                onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                placeholder="e.g. Sharma Logistics"
                required
              />
            </div>
            <div className="field-wrap">
              <label className="field-label">GSTIN</label>
              <input
                className="input"
                value={companyForm.gstin}
                onChange={(e) => setCompanyForm({ ...companyForm, gstin: e.target.value })}
                placeholder="27AAACR5055K1Z5"
              />
            </div>
          </div>
          <div className="form-row-2">
            <div className="field-wrap">
              <label className="field-label">Contact person</label>
              <input
                className="input"
                value={companyForm.contact_person}
                onChange={(e) => setCompanyForm({ ...companyForm, contact_person: e.target.value })}
              />
            </div>
            <div className="field-wrap">
              <label className="field-label">Phone</label>
              <input
                className="input"
                value={companyForm.phone}
                onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="form-row-2">
            <div className="field-wrap">
              <label className="field-label">Address</label>
              <input
                className="input"
                value={companyForm.address}
                onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
              />
            </div>
            <div className="field-wrap">
              <label className="field-label">Opening balance (₹ owed before using TransitOps)</label>
              <input
                type="number"
                className="input"
                value={companyForm.opening_balance}
                onChange={(e) => setCompanyForm({ ...companyForm, opening_balance: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setShowCompanyForm(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Add company
            </button>
          </div>
        </form>
      )}

      <div className="billing-grid">
        {/* Customers */}
        <section className="card companies-panel">
          <h2 className="panel-title">
            <IndianRupee size={15} /> Customers
          </h2>
          {loading && <p className="muted-note">Loading…</p>}
          {!loading && visibleCompanies.length === 0 && (
            <p className="muted-note">
              No customers yet. They are created automatically when a trip names one, or add one above.
            </p>
          )}
          <ul className="company-list">
            {visibleCompanies.map((c) => (
              <li key={c.id}>
                <button
                  className={`company-item ${companyId === c.id ? 'active' : ''}`}
                  onClick={() => setCompanyId(c.id)}
                >
                  <span className="company-name">{c.name}</span>
                  <span className="company-line">
                    <span>{Number(c.unbilled_trip_count)} unbilled · {money(c.unbilled_amount)}</span>
                    <span className={Number(c.outstanding_balance) > 0 ? 'due' : ''}>
                      Owes {money(c.outstanding_balance)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Bill builder */}
        <section className="card builder-panel">
          {!companyId && (
            <p className="muted-note">Select a customer to see the trips waiting to be billed.</p>
          )}

          {companyId && preview && (
            <>
              <div className="builder-head">
                <h2 className="panel-title">
                  <Receipt size={15} /> {preview.company?.name}
                </h2>
                {/* Only offered when it could actually add something: a
                    customer whose trips are all billed has nothing to
                    generate, so the control is not shown at all. */}
                {(pool.waiting.length > 0 || includeInProgress) && (
                  <label className="toggle-inline">
                    <input
                      type="checkbox"
                      checked={includeInProgress}
                      onChange={(e) => setIncludeInProgress(e.target.checked)}
                    />
                    Also bill trips that are not completed yet (Planned, Assigned, Dispatched)
                  </label>
                )}
              </div>

              {/* The statement ledger, exactly as the paper statement reads
                  it: previous balance -> this period -> closing balance. */}
              <div className="ledger-block">
                <div className="ledger-row">
                  <span>Previous balance (issued, not yet settled)</span>
                  <span className="num">{money(ledger.previous_balance)}</span>
                </div>
                <div className="ledger-row">
                  <span>Fares this period ({pool.billable.length} trip{pool.billable.length === 1 ? '' : 's'})</span>
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

              {previewLoading && <p className="muted-note">Loading trips…</p>}

              {pool.billable.length === 0 && !previewLoading && (pool.waiting.length > 0 || pool.unpriced.length > 0) && (
                <p className="muted-note">
                  {pool.waiting.length > 0 &&
                    `${pool.waiting.length} trip(s) are not finished yet, so their fares are not billable. `}
                  {pool.unpriced.length > 0 &&
                    `${pool.unpriced.length} trip(s) have no fare recorded yet.`}
                </p>
              )}

              {pool.billable.length > 0 && (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '34px' }} />
                      <th>Date</th>
                      <th>Route</th>
                      <th>Vehicle</th>
                      <th className="num">Fare</th>
                      <th className="num">Advance</th>
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
                        <td>
                          {t.origin} → {t.destination}
                        </td>
                        <td>{t.vehicle_registration || '—'}</td>
                        <td className="num">{money(t.revenue)}</td>
                        <td className="num">{money(t.advance_received)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {pool.waiting.length > 0 && (
                <div className="waiting-note">
                  <AlertTriangle size={14} />
                  <div>
                    <b>{pool.waiting.length} trip(s) not billable yet</b> ({money(pool.totals.waiting_amount)})
                    <ul>
                      {pool.waiting.slice(0, 5).map((t) => (
                        <li key={t.id}>
                          #{t.id} · {fmtDate(t.trip_date)} · {t.origin} → {t.destination} · {t.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* (No-fare trips are reported in the note above.) */}

              {/* Other expenses that ride on the statement: tolls, loading,
                  detention, driver allowance. They live on the open statement
                  until it is issued, and are frozen inside it afterwards. */}
              <div className="charges-block">
                <h3 className="sub-heading">Other charges</h3>

                {pendingCharges.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: '34px' }} />
                        <th>Date</th>
                        <th>Description</th>
                        <th>Type</th>
                        <th className="num">Amount</th>
                        <th style={{ width: '70px' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {pendingCharges.map((c) => (
                        <tr key={c.id} className={selectedChargeIds.includes(c.id) ? '' : 'row-muted'}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedChargeIds.includes(c.id)}
                              onChange={() => toggleCharge(c.id)}
                            />
                          </td>
                          <td>{fmtDate(c.charge_date)}</td>
                          <td>{c.description}</td>
                          <td>{String(c.kind || 'MISC').replace(/_/g, ' ').toLowerCase()}</td>
                          <td className="num">{money(c.amount)}</td>
                          <td className="row-actions">
                            <button
                              className="icon-btn"
                              title="Edit this charge"
                              onClick={() =>
                                setChargeForm({
                                  id: c.id,
                                  kind: c.kind || 'MISC',
                                  description: c.description,
                                  amount: c.amount,
                                  charge_date: c.charge_date || today()
                                })
                              }
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              className="icon-btn billing-icon-danger"
                              title="Remove from the open statement"
                              onClick={() => handleDeleteCharge(c)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted-note">No charges on this statement yet.</p>
                )}

                <form className="charge-form" onSubmit={handleSaveCharge}>
                  <div className="form-row-4">
                    <div className="field-wrap">
                      <label className="field-label">Date</label>
                      <input
                        type="date"
                        className="input"
                        value={chargeForm.charge_date}
                        onChange={(e) => setChargeForm({ ...chargeForm, charge_date: e.target.value })}
                      />
                    </div>
                    <div className="field-wrap">
                      <label className="field-label">Type</label>
                      <select
                        className="input"
                        value={chargeForm.kind}
                        onChange={(e) => setChargeForm({ ...chargeForm, kind: e.target.value })}
                      >
                        {CHARGE_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {k.replace(/_/g, ' ').toLowerCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field-wrap">
                      <label className="field-label">Description</label>
                      <input
                        className="input"
                        value={chargeForm.description}
                        onChange={(e) => setChargeForm({ ...chargeForm, description: e.target.value })}
                        placeholder="e.g. Toll — Manesar to Ahmedabad"
                      />
                    </div>
                    <div className="field-wrap">
                      <label className="field-label">Amount (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input"
                        value={chargeForm.amount}
                        onChange={(e) => setChargeForm({ ...chargeForm, amount: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="charge-form-actions">
                    {chargeForm.id && (
                      <button type="button" className="btn btn-outline" onClick={resetChargeForm}>
                        Cancel edit
                      </button>
                    )}
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={busy || !chargeForm.description.trim() || !chargeForm.amount}
                    >
                      <Plus size={14} /> {chargeForm.id ? 'Save charge' : 'Add charge'}
                    </button>
                  </div>
                </form>
              </div>

              {pool.billable.length + pendingCharges.length > 0 ? (
                <div className="builder-footer">
                  <input
                    className="input"
                    placeholder="Note on this statement (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="generate-summary">
                    <span>
                      {selectedTripIds.length} of {pool.billable.length} trips ·{' '}
                      {selectedChargeIds.length} of {pendingCharges.length} charges ·{' '}
                      {money(selectedFares)} fares + {money(selectedChargeTotal)} charges selected
                    </span>
                    <button
                      className="btn btn-primary"
                      onClick={handleIssueStatement}
                      disabled={busy || selectedTripIds.length + selectedChargeIds.length === 0}
                    >
                      <FileText size={15} /> Issue statement
                    </button>
                  </div>
                </div>
              ) : (
                /* Everything this customer owes is already on an issued
                   document, so there is deliberately nothing to issue: a
                   statement with no new lines would only repeat what they owe. */
                <div className="builder-caughtup">
                  <Check size={16} />
                  <div>
                    <b>All caught up.</b> Every billable trip and charge for this customer is already on an
                    issued statement.
                    {latestBill && (
                      <>
                        {' '}
                        Latest:{' '}
                        <button className="link-btn" onClick={() => handleOpenBill(latestBill.id)}>
                          {latestBill.bill_no} · {money(latestBill.remaining_balance)} outstanding
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {companyId && !preview && previewLoading && <p className="muted-note">Loading…</p>}
        </section>
      </div>

      {/* Bills */}
      <section className="card bills-panel">
        <h2 className="panel-title">
          <FileText size={15} /> Bills
        </h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Bill no</th>
              <th>Customer</th>
              <th>Date</th>
              <th className="num">Previous</th>
              <th className="num">Fares</th>
              <th className="num">Advance</th>
              <th className="num">Outstanding</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleBills.map((b) => (
              <tr key={b.id} className={b.status === 'Void' ? 'row-void' : ''}>
                <td className="mono">{b.bill_no}</td>
                <td>{b.company_name}</td>
                <td>{fmtDate(b.bill_date)}</td>
                <td className="num">{money(b.previous_balance)}</td>
                <td className="num">{money(b.subtotal)}</td>
                <td className="num">{money(b.total_advance)}</td>
                <td className="num strong">{money(b.remaining_balance)}</td>
                <td>
                  <StatusChip status={b.status} />
                </td>
                <td className="row-actions">
                  <button className="icon-btn" title="Open" onClick={() => handleOpenBill(b.id)}>
                    <Receipt size={15} />
                  </button>
                  <button className="icon-btn" title="Download bill" onClick={() => handleDownload(b)}>
                    <Download size={15} />
                  </button>
                  {/* A voided statement keeps its number and lines but is no
                      longer actionable — no second void, nothing to pay. */}
                  {b.status !== 'Void' && (
                    <button className="icon-btn billing-icon-danger" title="Void bill" onClick={() => handleVoid(b)}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && visibleBills.length === 0 && (
              <tr>
                <td colSpan={9} className="muted-note">
                  No statements issued yet. Select a customer above and issue their first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Bill detail */}
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
                  <b>VOID.</b> This statement was cancelled
                  {openBill.voided_at ? ` on ${fmtDate(String(openBill.voided_at).slice(0, 10))}` : ''}
                  {openBill.void_reason ? ` — ${openBill.void_reason}` : ''}. Its trips and charges are back on the
                  open statement, and the number stays on record.
                </div>
              )}
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Particulars</th>
                    <th>Vehicle</th>
                    <th className="num">Amount</th>
                    <th className="num">Advance</th>
                  </tr>
                </thead>
                <tbody>
                  {openBill.items.map((it) => (
                    <tr key={it.id}>
                      <td>{fmtDate(it.trip_date)}</td>
                      <td>{it.particulars}</td>
                      <td>{it.vehicle_registration || '—'}</td>
                      <td className="num">{money(it.amount)}</td>
                      <td className="num">{money(it.advance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(openBill.charges || []).length > 0 && (
                <>
                  <h4 className="sub-heading">Other charges</h4>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Type</th>
                        <th className="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openBill.charges.map((c) => (
                        <tr key={c.id}>
                          <td>{fmtDate(c.charge_date)}</td>
                          <td>{c.description}</td>
                          <td>{String(c.kind || 'MISC').replace(/_/g, ' ').toLowerCase()}</td>
                          <td className="num">{money(c.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              <div className="totals-block">
                <div className="totals-row">
                  <span>Previous balance</span>
                  <span>{money(openBill.previous_balance)}</span>
                </div>
                <div className="totals-row">
                  <span>Fares this period</span>
                  <span>{money(openBill.subtotal)}</span>
                </div>
                {parseFloat(openBill.charges_total || 0) !== 0 && (
                  <div className="totals-row">
                    <span>Other charges</span>
                    <span>{money(openBill.charges_total)}</span>
                  </div>
                )}
                <div className="totals-row">
                  <span>Less: advances received</span>
                  <span>− {money(openBill.total_advance)}</span>
                </div>
                <div className="totals-row due">
                  <span>Closing balance</span>
                  <span>{money(openBill.balance_due)}</span>
                </div>
                <div className="totals-row">
                  <span>Paid</span>
                  <span>{money(openBill.amount_paid)}</span>
                </div>
                <div className="totals-row outstanding">
                  <span>Outstanding</span>
                  <span>{money(openBill.remaining_balance)}</span>
                </div>
              </div>

              <p className="words-note">{openBill.remaining_balance_in_words}</p>

              {openBill.payments.length > 0 && (
                <>
                  <h4 className="sub-heading">Payments received</h4>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Mode</th>
                        <th>Note</th>
                        <th className="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openBill.payments.map((p) => (
                        <tr key={p.id}>
                          <td>{fmtDate(p.payment_date)}</td>
                          <td>{p.mode}</td>
                          <td>{p.note || '—'}</td>
                          <td className="num">{money(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {openBill.status === 'Void' ? (
                <p className="settled-note">
                  <AlertTriangle size={15} /> Nothing to pay on a voided statement.
                </p>
              ) : openBill.remaining_balance > 0 ? (
                <form className="payment-form" onSubmit={handlePayment}>
                  <h4 className="sub-heading">Record a payment</h4>
                  <div className="form-row-3">
                    <div className="field-wrap">
                      <label className="field-label">Amount (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input"
                        value={payment.amount}
                        onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
                        placeholder={String(openBill.remaining_balance)}
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
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field-wrap">
                      <label className="field-label">Date</label>
                      <input
                        type="date"
                        className="input"
                        value={payment.payment_date}
                        onChange={(e) => setPayment({ ...payment, payment_date: e.target.value })}
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={busy || !payment.amount}>
                    <Check size={15} /> Record payment
                  </button>
                </form>
              ) : (
                <p className="settled-note">
                  <Check size={15} /> This bill is settled in full.
                </p>
              )}
            </div>

            <div className="drawer-footer">
              {openBill.status !== 'Void' && (
                <button
                  className="btn btn-outline billing-btn-danger"
                  onClick={() => handleVoid(openBill)}
                  disabled={busy}
                >
                  <Trash2 size={15} /> Void bill
                </button>
              )}
              <button className="btn btn-primary" onClick={() => handleDownload(openBill)}>
                <Download size={15} /> Download bill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
