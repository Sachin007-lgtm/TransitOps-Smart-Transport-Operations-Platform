// Build a print-ready monthly Fuel & Expense bill as HTML, in the same style
// as the billing module's customer bills (utils/billHtml.js) but for an
// internal statement: it shows what the operation SPENT in a calendar month —
// a per-category breakdown plus every ledger line — so there are no
// advance/payment/balance sections and no "Bill to" party.
//
// The file opens in any browser; printing it (Ctrl+P → Save as PDF) yields a
// paper/PDF bill without adding a PDF-rendering dependency.
const { numberToWords } = require('./amountInWords');

/**
 * Escape HTML metacharacters.
 *
 * Built from char codes rather than an entity-literal map on purpose:
 * editing/tooling pipelines have silently stripped literal entities out of
 * this kind of function before, turning the escape into a no-op (an XSS hole
 * in a document that prints vendor-supplied text). Numeric entities cannot
 * be stripped without breaking the code.
 */
function esc(value) {
  return String(value ?? '').replace(/[&<>\"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
}

function fmt(n) {
  return parseFloat(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtDate(d) {
  if (!d) return '—';
  // Ledger dates arrive as plain 'YYYY-MM-DD' text (see expenseModel), so
  // they are formatted directly: running them through Date would treat them
  // as UTC midnight and could print the previous day.
  const plain = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (plain) return `${plain[3]}/${plain[2]}/${plain[1]}`;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('en-IN');
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function monthLabel(month) {
  const m = String(month || '').match(/^(\d{4})-(\d{2})/);
  if (!m) return String(month || '');
  return `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}`;
}

// Title-cases a category enum for the breakdown table (FUEL → Fuel).
function categoryLabel(category) {
  const label = String(category || 'Other').toLowerCase();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthlyBillHtml(data) {
  const breakdownRows = (data.breakdown || [])
    .map(
      (b) => `
        <tr>
          <td>${esc(categoryLabel(b.category))}</td>
          <td class="num">${b.entry_count}</td>
          <td class="num">${Number(b.litres) > 0 ? fmt(b.litres) + ' L' : '—'}</td>
          <td class="num">${Number(b.first_odometer) > 0 ? Number(b.first_odometer).toLocaleString('en-IN') : '—'} – ${Number(b.last_odometer) > 0 ? Number(b.last_odometer).toLocaleString('en-IN') : '—'}</td>
          <td class="num">${fmt(b.total_amount)}</td>
        </tr>`
    )
    .join('');

  const entryRows = (data.entries || [])
    .map(
      (e) => `
        <tr>
          <td>${esc(fmtDate(e.expense_date))}</td>
          <td>${esc(categoryLabel(e.category))}</td>
          <td>${esc(e.description)}</td>
          <td>${esc(e.vehicle_registration || '—')}${e.trip_id ? ` · ${esc('TR-' + String(e.trip_id).replace(/-/g, '').slice(0, 8).toUpperCase())}` : ''}</td>
          <td class="num">${e.quantity ? fmt(e.quantity) + ' L' : '—'}</td>
          <td class="num">${e.odometer != null ? Number(e.odometer).toLocaleString('en-IN') : '—'}</td>
          <td class="num">${fmt(e.amount)}</td>
        </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Expense Bill ${esc(monthLabel(data.month))}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; background: #fff; padding: 32px; }
  .wrap { max-width: 860px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; gap: 16px; border-bottom: 3px solid #1a1a1a; padding-bottom: 16px; }
  .issuer { font-size: 20px; font-weight: 700; }
  .muted { color: #555; font-size: 12px; }
  .bill-no { font-family: 'Courier New', monospace; font-size: 18px; font-weight: 700; }
  .bill-meta { text-align: right; font-size: 13px; }
  .bill-meta div { margin-bottom: 2px; }
  .period { margin-top: 18px; display: flex; gap: 24px; }
  .period-box { flex: 1; border: 1px solid #ddd; padding: 10px 12px; font-size: 13px; }
  .period-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 1px solid #1a1a1a; padding: 8px 8px; }
  td { padding: 8px; border-bottom: 1px solid #ddd; font-size: 13px; }
  td.num, th.num { text-align: right; font-family: 'Courier New', monospace; }
  .section-title { margin-top: 24px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
  .totals { margin-top: 16px; margin-left: auto; width: 340px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 13px; color: #444; }
  .totals-row .num { font-family: 'Courier New', monospace; color: #1a1a1a; }
  .totals-due { border-top: 1px dashed #999; margin-top: 4px; padding-top: 8px; font-weight: 700; font-size: 15px; color: #1a1a1a; }
  .words { margin-top: 12px; border: 1px solid #ddd; padding: 8px 12px; font-size: 12px; color: #444; background: #fafafa; }
  .words b { color: #1a1a1a; }
  .sign { margin-top: 48px; display: flex; justify-content: space-between; font-size: 13px; color: #444; }
  .sign-line { border-top: 1px solid #1a1a1a; width: 240px; padding-top: 6px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <div class="issuer">${esc(data.organization_name || 'TransitOps')}</div>
        <div class="muted">Fuel & Expense Statement — internal</div>
      </div>
      <div class="bill-meta">
        <div class="bill-no">${esc(monthLabel(data.month))}</div>
        <div>Period: ${esc(fmtDate(data.from_date))} to ${esc(fmtDate(data.to_date))}</div>
        <div>Generated: ${esc(new Date().toLocaleDateString('en-IN'))}</div>
      </div>
    </div>

    <div class="period">
      <div class="period-box">
        <div class="period-label">This bill covers</div>
        <div>${data.entries && data.entries.length ? `${data.entries.length} expense line(s)` : 'No expenses in this month'}</div>
        <div class="muted">All vehicles · every category</div>
      </div>
      <div class="period-box">
        <div class="period-label">Fuel this month</div>
        <div>${esc(fmt((data.breakdown || []).find((b) => b.category === 'FUEL')?.total_amount || 0))}</div>
        <div class="muted">${esc(fmt((data.breakdown || []).find((b) => b.category === 'FUEL')?.litres || 0))} litres diesel</div>
      </div>
    </div>

    <div class="section-title">Breakdown by category</div>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th class="num" style="width:90px">Entries</th>
          <th class="num" style="width:110px">Litres</th>
          <th class="num" style="width:190px">Odometer span</th>
          <th class="num" style="width:130px">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${breakdownRows || '<tr><td colspan="5">No expenses logged in this month.</td></tr>'}
      </tbody>
    </table>

    <div class="section-title">Expense ledger — every line, oldest first</div>
    <table>
      <thead>
        <tr>
          <th style="width:80px">Date</th>
          <th style="width:95px">Category</th>
          <th>Particulars</th>
          <th style="width:170px">Vehicle / Trip</th>
          <th class="num" style="width:75px">Qty</th>
          <th class="num" style="width:95px">Odometer</th>
          <th class="num" style="width:110px">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${entryRows || '<tr><td colspan="7">No expenses logged in this month.</td></tr>'}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row totals-due"><span>Total expenses — ${esc(monthLabel(data.month))}</span><span class="num">${fmt(data.total)}</span></div>
    </div>

    <div class="words"><b>Amount in words:</b> ${esc(numberToWords(data.total).replace(/^Rupees /, ''))}</div>

    <div class="sign">
      <div class="sign-line">Checked by</div>
      <div class="sign-line" style="text-align:right">For ${esc(data.organization_name || '')} — Authorised Signatory</div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { monthlyBillHtml };
