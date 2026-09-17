import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText, Plus, RefreshCw, IndianRupee, Building2, AlertCircle,
  CheckCircle2, Printer, Trash2, Landmark, Search, Download
} from 'lucide-react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { apiRequest, apiDownload } from '../utils/api';
import './Billing.css';

const PAYMENT_MODES = ['Cash', 'UPI', 'NEFT', 'IMPS', 'RTGS', 'Cheque', 'Bank Transfer', 'Other'];

const billStatusConfig = {
  'Unpaid': 'red',
  'Partially Paid': 'orange',
  'Paid': 'green'
};

function fmt(n) {
  const value = parseFloat(n || 0);
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Billing() {
  const { globalSearch } = useGlobalSearch();

  const [companies, setCompanies] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('bills'); // 'bills' | 'companies'
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');

  // Bill detail modal
  const [activeBill, setActiveBill] = useState(null);
  const [paymentModalBill, setPaymentModalBill] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', mode: 'UPI', payment_date: '', note: '' });

  // Add company modal
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState({
    name: '', contact_person: '', email: '', phone: '', address: '', gstin: '', opening_balance: ''
  });
  const [companyFormError, setCompanyFormError] = useState('');

  const showToast = (message, type = 'info') => {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: message, type }));
  };

  const loadData = useCallback(async () => {
    try {
      setError('');
      const [companiesRes, billsRes] = await Promise.all([
        apiRequest('GET', '/billing/companies'),
        apiRequest('GET', '/billing/bills')
      ]);
      setCompanies(companiesRes.data || []);
      setBills(billsRes.data || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load billing data. Is the server running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openBill = async (id) => {
    try {
      const res = await apiRequest('GET', `/billing/bills/${id}`);
      setActiveBill(res.data);
    } catch (err) {
      showToast(err.message || 'Failed to load bill', 'error');
    }
  };

  const generateBill = async (companyId, companyName) => {
    try {
      const res = await apiRequest('POST', '/billing/bills', { company_id: companyId });
      showToast(`${res.data.bill_no} generated for ${companyName} — balance due ₹${fmt(res.data.balance_due)}`);
      loadData();
      // Open the bill breakdown right away so the owner sees every trip
      // charge immediately instead of hunting for it in the Bills tab.
      setActiveBill(res.data);
    } catch (err) {
      showToast(err.message || 'Failed to generate bill', 'error');
    }
  };

  const downloadBill = async (bill) => {
    try {
      await apiDownload(`/billing/bills/${bill.id}/download`, `${bill.bill_no}.html`);
      showToast(`${bill.bill_no} downloaded — open it and print to PDF.`);
    } catch (err) {
      showToast(err.message || 'Failed to download bill', 'error');
    }
  };

  const submitPayment = async (e) => {
    e.preventDefault();
    if (!paymentModalBill) return;
    const amount = parseFloat(paymentForm.amount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Enter a valid payment amount.', 'error');
      return;
    }
    try {
      await apiRequest('POST', `/billing/bills/${paymentModalBill.id}/payments`, {
        amount,
        mode: paymentForm.mode,
        payment_date: paymentForm.payment_date || undefined,
        note: paymentForm.note || undefined
      });
      showToast('Payment recorded.');
      setPaymentModalBill(null);
      setPaymentForm({ amount: '', mode: 'UPI', payment_date: '', note: '' });
      loadData();
      if (activeBill) openBill(activeBill.id);
    } catch (err) {
      showToast(err.message || 'Failed to record payment', 'error');
    }
  };

  const deleteBill = async (bill) => {
    if (!window.confirm(`Delete ${bill.bill_no}? Its trips return to the unbilled pool.`)) return;
    try {
      await apiRequest('DELETE', `/billing/bills/${bill.id}`);
      showToast(`${bill.bill_no} deleted.`);
      setActiveBill(null);
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to delete bill', 'error');
    }
  };

  const addCompany = async (e) => {
    e.preventDefault();
    if (!companyForm.name.trim()) {
      setCompanyFormError('Company name is required.');
      return;
    }
    try {
      const payload = { ...companyForm };
      if (payload.opening_balance === '') delete payload.opening_balance;
      else payload.opening_balance = parseFloat(payload.opening_balance) || 0;
      await apiRequest('POST', '/billing/companies', payload);
      showToast('Company added.');
      setCompanyModalOpen(false);
      setCompanyForm({ name: '', contact_person: '', email: '', phone: '', address: '', gstin: '', opening_balance: '' });
      setCompanyFormError('');
      loadData();
    } catch (err) {
      setCompanyFormError(err.message || 'Failed to add company');
    }
  };

  // --- KPIs ---
  const totalOutstanding = bills
    .filter(b => b.status !== 'Paid')
    .reduce((s, b) => s + (parseFloat(b.balance_due) - parseFloat(b.amount_paid)), 0);
  const unpaidCount = bills.filter(b => b.status !== 'Paid').length;
  const collected = bills.reduce((s, b) => s + parseFloat(b.amount_paid || 0), 0);
  const unbilledValue = companies.reduce((s, c) => s + parseFloat(c.unbilled_amount || 0), 0);

  const filteredBills = bills.filter(b => {
    const matchesStatus = statusFilter === 'All' || b.status === statusFilter;
    const q = (globalSearch || search).toLowerCase();
    const matchesSearch = !q
      || b.bill_no.toLowerCase().includes(q)
      || (b.company_name || '').toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const filteredCompanies = companies.filter(c => {
    const q = (globalSearch || search).toLowerCase();
    return !q || c.name.toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="flex-col gap-4 w-full h-full p-4">
        <div className="skeleton" style={{ width: '25%', height: '2.5rem', marginBottom: '1rem' }} />
        <div className="flex gap-4">
          {Array(4).fill(0).map((_, i) => <div key={i} className="skeleton flex-1" style={{ height: '6rem' }} />)}
        </div>
        <div className="skeleton w-full" style={{ height: '20rem' }} />
      </div>
    );
  }

  return (
    <div className="billing-page fade-in">
      <div className="billing-header">
        <h1 className="billing-title">Invoices & Billing</h1>
        <div className="billing-actions">
          <button className="btn btn-outline" onClick={loadData}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setCompanyModalOpen(true)}>
            <Plus size={15} /> Add Company
          </button>
        </div>
      </div>

      {error && (
        <div className="billing-error">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* KPI Row */}
      <div className="billing-kpis">
        <div className="billing-kpi border-red">
          <span className="kpi-label">Total Outstanding</span>
          <span className="kpi-value mono">₹{fmt(totalOutstanding)}</span>
          <span className="kpi-sub">{unpaidCount} unpaid bill{unpaidCount === 1 ? '' : 's'}</span>
        </div>
        <div className="billing-kpi border-orange">
          <span className="kpi-label">Unbilled Work</span>
          <span className="kpi-value mono">₹{fmt(unbilledValue)}</span>
          <span className="kpi-sub">completed trips not yet billed</span>
        </div>
        <div className="billing-kpi border-green">
          <span className="kpi-label">Collected</span>
          <span className="kpi-value mono">₹{fmt(collected)}</span>
          <span className="kpi-sub">payments recorded to date</span>
        </div>
        <div className="billing-kpi border-blue">
          <span className="kpi-label">Companies</span>
          <span className="kpi-value mono">{companies.length}</span>
          <span className="kpi-sub">{companies.filter(c => parseFloat(c.unbilled_trip_count) > 0).length} with unbilled trips</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="billing-tabs">
        <button className={`billing-tab ${tab === 'bills' ? 'active' : ''}`} onClick={() => setTab('bills')}>
          <FileText size={15} /> Bills ({bills.length})
        </button>
        <button className={`billing-tab ${tab === 'companies' ? 'active' : ''}`} onClick={() => setTab('companies')}>
          <Building2 size={15} /> Companies ({companies.length})
        </button>
        <div className="billing-tab-spacer" />
        <div className="billing-filter">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search bills or companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="billing-search"
          />
        </div>
        {tab === 'bills' && (
          <select className="select billing-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All">All statuses</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Paid">Paid</option>
          </select>
        )}
      </div>

      {/* Bills Table */}
      {tab === 'bills' && (
        <div className="card billing-card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Bill No</th>
                  <th>Company</th>
                  <th>Date</th>
                  <th className="text-right">Previous Bal.</th>
                  <th className="text-right">Subtotal</th>
                  <th className="text-right">Advance</th>
                  <th className="text-right">Balance Due</th>
                  <th className="text-right">Paid</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.length === 0 && (
                  <tr><td colSpan={10} className="billing-empty">No bills yet — generate one from a company's unbilled trips.</td></tr>
                )}
                {filteredBills.map(b => {
                  const color = billStatusConfig[b.status] || 'gray';
                  const remaining = parseFloat(b.balance_due) - parseFloat(b.amount_paid);
                  return (
                    <tr key={b.id} className="table-row-animate" style={{ borderLeft: `4px solid var(--status-${color === 'orange' ? 'orange' : color})` }}>
                      <td className="mono font-semibold">{b.bill_no}</td>
                      <td>{b.company_name}</td>
                      <td className="mono">{new Date(b.bill_date).toLocaleDateString('en-IN')}</td>
                      <td className="mono text-right">{fmt(b.previous_balance)}</td>
                      <td className="mono text-right">{fmt(b.subtotal)}</td>
                      <td className="mono text-right">{fmt(b.total_advance)}</td>
                      <td className="mono text-right font-semibold">₹{fmt(remaining)}</td>
                      <td className="mono text-right">{fmt(b.amount_paid)}</td>
                      <td><span className={`pill pill-${color}`}>{b.status}</span></td>
                      <td className="text-right billing-row-actions">
                        <button className="billing-icon-btn" title="View bill" onClick={() => openBill(b.id)}><FileText size={15} /></button>
                        <button className="billing-icon-btn" title="Download bill" onClick={() => downloadBill(b)}><Download size={15} /></button>
                        {b.status !== 'Paid' && (
                          <button
                            className="billing-icon-btn"
                            title="Record payment"
                            onClick={() => { setPaymentModalBill(b); setPaymentForm({ amount: '', mode: 'UPI', payment_date: '', note: '' }); }}
                          >
                            <IndianRupee size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Companies Table */}
      {tab === 'companies' && (
        <div className="card billing-card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th className="text-right">Outstanding</th>
                  <th className="text-right">Unbilled Trips</th>
                  <th className="text-right">Unbilled Amount</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.length === 0 && (
                  <tr><td colSpan={8} className="billing-empty">No companies yet — add your first client company.</td></tr>
                )}
                {filteredCompanies.map(c => (
                  <tr key={c.id}>
                    <td className="font-semibold">{c.name}</td>
                    <td className="text-muted">{c.contact_person || '—'}</td>
                    <td className="mono">{c.phone || '—'}</td>
                    <td className={`mono text-right ${parseFloat(c.outstanding_balance) > 0 ? 'font-semibold' : ''}`}>
                      {fmt(c.outstanding_balance)}
                    </td>
                    <td className="mono text-right">{c.unbilled_trip_count}</td>
                    <td className="mono text-right">{fmt(c.unbilled_amount)}</td>
                    <td>
                      <span className={`pill ${c.status === 'Active' ? 'pill-green' : 'pill-gray'}`}>{c.status}</span>
                    </td>
                    <td className="text-right">
                      <button
                        className={`btn btn-outline billing-generate-btn ${!parseInt(c.unbilled_trip_count) ? 'disabled' : ''}`}
                        disabled={!parseInt(c.unbilled_trip_count)}
                        onClick={() => generateBill(c.id, c.name)}
                        title={!parseInt(c.unbilled_trip_count) ? 'No unbilled completed trips' : 'Generate bill from all unbilled trips'}
                      >
                        <FileText size={14} /> Generate Bill
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bill Detail Modal */}
      {activeBill && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setActiveBill(null); }}>
          <div className="billing-bill-modal modal-content">
            <div className="billing-bill-head">
              <div>
                <div className="mono billing-bill-no">{activeBill.bill_no}</div>
                <div className="billing-bill-company">{activeBill.company_name}</div>
                <div className="text-xs text-muted">
                  {activeBill.company_address}
                  {activeBill.company_gstin ? ` · GSTIN: ${activeBill.company_gstin}` : ''}
                </div>
              </div>
              <div className="billing-bill-head-right">
                <span className={`pill pill-${billStatusConfig[activeBill.status] || 'gray'}`}>{activeBill.status}</span>
                <div className="text-xs text-muted">Bill date</div>
                <div className="mono">{new Date(activeBill.bill_date).toLocaleDateString('en-IN')}</div>
              </div>
            </div>

            <div className="table-container billing-items-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Particulars</th>
                    <th>Vehicle</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Advance</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBill.items.map(it => (
                    <tr key={it.id}>
                      <td className="mono">{it.trip_date ? new Date(it.trip_date).toLocaleDateString('en-IN') : '—'}</td>
                      <td>{it.particulars}</td>
                      <td className="mono">{it.vehicle_registration || '—'}</td>
                      <td className="mono text-right">{fmt(it.amount)}</td>
                      <td className="mono text-right">{it.advance ? fmt(it.advance) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="billing-totals">
              <div className="billing-totals-row"><span>Previous balance</span><span className="mono">₹{fmt(activeBill.previous_balance)}</span></div>
              <div className="billing-totals-row"><span>Subtotal (this bill)</span><span className="mono">₹{fmt(activeBill.subtotal)}</span></div>
              <div className="billing-totals-row"><span>Less: advances received</span><span className="mono">− ₹{fmt(activeBill.total_advance)}</span></div>
              <div className="billing-totals-row"><span>Total (this bill)</span><span className="mono">₹{fmt(activeBill.balance_due)}</span></div>
              {parseFloat(activeBill.amount_paid) > 0 && (
                <div className="billing-totals-row"><span>Less: payments received</span><span className="mono">− ₹{fmt(activeBill.amount_paid)}</span></div>
              )}
              <div className="billing-totals-row billing-totals-due"><span>Balance due (outstanding)</span><span className="mono">₹{fmt(activeBill.remaining_balance ?? (parseFloat(activeBill.balance_due) - parseFloat(activeBill.amount_paid || 0)))}</span></div>
              <div className="billing-words">
                <em>Amount in words (balance due):</em> {activeBill.remaining_balance_in_words || activeBill.balance_due_in_words}
              </div>
            </div>

            {activeBill.payments.length > 0 && (
              <div className="billing-payments">
                <div className="text-xs uppercase font-semibold text-muted tracking-wider">Payments</div>
                {activeBill.payments.map(p => (
                  <div key={p.id} className="billing-payment-row mono">
                    <span>{new Date(p.payment_date).toLocaleDateString('en-IN')}</span>
                    <span>{p.mode}</span>
                    <span className="font-semibold">₹{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="billing-modal-actions">
              {activeBill.status !== 'Paid' && (
                <button
                  className="btn btn-primary"
                  onClick={() => { setPaymentModalBill(activeBill); setPaymentForm({ amount: '', mode: 'UPI', payment_date: '', note: '' }); }}
                >
                  <IndianRupee size={14} /> Record Payment
                </button>
              )}
              <button className="btn btn-outline" onClick={() => downloadBill(activeBill)}>
                <Download size={14} /> Download
              </button>
              <button className="btn btn-outline" onClick={() => window.print()}>
                <Printer size={14} /> Print
              </button>
              <button className="btn btn-outline billing-danger-btn" onClick={() => deleteBill(activeBill)}>
                <Trash2 size={14} /> Delete
              </button>
              <button className="btn btn-outline" onClick={() => setActiveBill(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {paymentModalBill && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPaymentModalBill(null); }}>
          <form className="modal-content" style={{ maxWidth: 420 }} onSubmit={submitPayment}>
            <div className="billing-modal-title">
              <Landmark size={18} />
              <div>
                <div className="font-semibold">Record payment</div>
                <div className="text-xs text-muted">{paymentModalBill.bill_no} · {paymentModalBill.company_name}</div>
              </div>
            </div>
            <div className="input-group">
              <label>Amount (₹) — balance ₹{fmt(parseFloat(paymentModalBill.balance_due) - parseFloat(paymentModalBill.amount_paid || 0))}</label>
              <input
                className="input mono"
                type="number"
                step="0.01"
                min="0.01"
                autoFocus
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label>Mode</label>
              <select
                className="select"
                value={paymentForm.mode}
                onChange={(e) => setPaymentForm({ ...paymentForm, mode: e.target.value })}
              >
                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>Date</label>
              <input
                className="input"
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Note (optional)</label>
              <input
                className="input"
                type="text"
                value={paymentForm.note}
                onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })}
              />
            </div>
            <div className="billing-modal-actions">
              <button type="submit" className="btn btn-primary"><CheckCircle2 size={14} /> Save Payment</button>
              <button type="button" className="btn btn-outline" onClick={() => setPaymentModalBill(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Add Company Modal */}
      {companyModalOpen && createPortal(
        (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCompanyModalOpen(false); }}>
            <form className="modal-content" style={{ maxWidth: 480 }} onSubmit={addCompany}>
              <div className="billing-modal-title">
                <Building2 size={18} />
                <div className="font-semibold">Add client company</div>
              </div>
              {companyFormError && <div className="billing-error"><AlertCircle size={14} /> {companyFormError}</div>}
              <div className="input-group">
                <label>Company name *</label>
                <input className="input" autoFocus value={companyForm.name}
                  onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} required />
              </div>
              <div className="input-group">
                <label>Contact person</label>
                <input className="input" value={companyForm.contact_person}
                  onChange={(e) => setCompanyForm({ ...companyForm, contact_person: e.target.value })} />
              </div>
              <div className="billing-form-grid">
                <div className="input-group">
                  <label>Phone</label>
                  <input className="input" value={companyForm.phone}
                    onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Email</label>
                  <input className="input" type="email" value={companyForm.email}
                    onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })} />
                </div>
              </div>
              <div className="input-group">
                <label>Address</label>
                <input className="input" value={companyForm.address}
                  onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} />
              </div>
              <div className="billing-form-grid">
                <div className="input-group">
                  <label>GSTIN (optional)</label>
                  <input className="input mono" value={companyForm.gstin}
                    onChange={(e) => setCompanyForm({ ...companyForm, gstin: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Opening balance (₹ owed)</label>
                  <input className="input mono" type="number" step="0.01" value={companyForm.opening_balance}
                    onChange={(e) => setCompanyForm({ ...companyForm, opening_balance: e.target.value })} />
                </div>
              </div>
              <div className="billing-modal-actions">
                <button type="submit" className="btn btn-primary"><Plus size={14} /> Add Company</button>
                <button type="button" className="btn btn-outline" onClick={() => setCompanyModalOpen(false)}>Cancel</button>
              </div>
            </form>
          </div>
        ),
        document.body
      )}
    </div>
  );
}
