// Build a print-ready HTML bill document, styled after the paper bills this
// system replaces (workspace root: AJAY statement, B-7 ledger with
// carry-forward balance, GST transport-invoice template).
//
// The file opens in any browser; printing it (Ctrl+P → Save as PDF) yields a
// paper/PDF bill without adding a PDF-rendering dependency.
//
// Roles in the document: the ISSUER is the organization (the transport
// operator using TransitOps) and the BILL TO party is the company being
// billed — the opposite of the customer-facing header, and the correct
// direction for an invoice.

/**
 * Escape HTML metacharacters.
 *
 * Built from char codes rather than an entity-literal map on purpose:
 * editing/tooling pipelines have silently stripped literal entities out of
 * this kind of function before, turning the escape into a no-op (an XSS hole
 * in a document that prints customer-supplied text). Numeric entities cannot
 * be stripped without breaking the code.
 */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
}

function fmt(n) {
  return parseFloat(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtDate(d) {
  if (!d) return '—';
  // Bill dates arrive as plain 'YYYY-MM-DD' (see billModel), so they are
  // formatted directly: running them through Date would treat them as UTC
  // midnight and could print the previous day.
  const plain = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (plain) return `${plain[3]}/${plain[2]}/${plain[1]}`;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('en-IN');
}

function billHtml(bill) {
  const itemRows = (bill.items || [])
    .map(
      (it) => `
        <tr>
          <td>${esc(fmtDate(it.trip_date))}</td>
          <td>${esc(it.particulars)}</td>
          <td>${esc(it.vehicle_registration || '—')}</td>
          <td class="num">${esc(it.rate_basis || '')}</td>
          <td class="num">${fmt(it.amount)}</td>
          <td class="num">${parseFloat(it.advance) ? fmt(it.advance) : '—'}</td>
        </tr>`
    )
    .join('');

  const paymentRows = (bill.payments || [])
    .map(
      (p) => `
        <tr>
          <td>${esc(fmtDate(p.payment_date))}</td>
          <td>${esc(p.mode)}</td>
          <td>${esc(p.note || '')}</td>
          <td class="num">${fmt(p.amount)}</td>
        </tr>`
    )
    .join('');

  // Outstanding after payments — the figure the bottom BALANCE line shows on
  // the paper bills, and the one the owner quotes when following up.
  const remaining = Math.max(0, parseFloat(bill.balance_due) - parseFloat(bill.amount_paid || 0));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(bill.bill_no)} — ${esc(bill.company_name || '')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; background: #fff; padding: 32px; }
  .wrap { max-width: 820px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; gap: 16px; border-bottom: 3px solid #1a1a1a; padding-bottom: 16px; }
  .issuer { font-size: 20px; font-weight: 700; }
  .muted { color: #555; font-size: 12px; }
  .bill-no { font-family: 'Courier New', monospace; font-size: 18px; font-weight: 700; }
  .bill-meta { text-align: right; font-size: 13px; }
  .bill-meta div { margin-bottom: 2px; }
  .status { display: inline-block; border: 1px solid #1a1a1a; padding: 2px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
  .party { margin-top: 18px; display: flex; gap: 24px; }
  .party-box { flex: 1; border: 1px solid #ddd; padding: 10px 12px; font-size: 13px; }
  .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 1px solid #1a1a1a; padding: 8px 8px; }
  td { padding: 8px; border-bottom: 1px solid #ddd; font-size: 13px; }
  td.num, th.num { text-align: right; font-family: 'Courier New', monospace; }
  .totals { margin-top: 16px; margin-left: auto; width: 340px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 13px; color: #444; }
  .totals-row .num { font-family: 'Courier New', monospace; color: #1a1a1a; }
  .totals-due { border-top: 1px dashed #999; margin-top: 4px; padding-top: 8px; font-weight: 700; font-size: 15px; color: #1a1a1a; }
  .words { margin-top: 12px; border: 1px solid #ddd; padding: 8px 12px; font-size: 12px; color: #444; background: #fafafa; }
  .words b { color: #1a1a1a; }
  .payments { margin-top: 16px; }
  .payments h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin-bottom: 4px; }
  .payments table { margin-top: 0; }
  .account { margin-top: 28px; border: 1px solid #1a1a1a; padding: 12px 16px; font-size: 13px; }
  .account b { text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em; }
  .sign { margin-top: 48px; display: flex; justify-content: space-between; font-size: 13px; color: #444; }
  .sign-line { border-top: 1px solid #1a1a1a; width: 240px; padding-top: 6px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <div class="issuer">${esc(bill.organization_name || 'TransitOps')}</div>
        <div class="muted">Transport operator</div>
      </div>
      <div class="bill-meta">
        <div class="bill-no">${esc(bill.bill_no)}</div>
        <div>Date: ${esc(fmtDate(bill.bill_date))}</div>
        <div><span class="status">${esc(bill.status)}</span></div>
      </div>
    </div>

    <div class="party">
      <div class="party-box">
        <div class="party-label">Bill to</div>
        <div><b>${esc(bill.company_name)}</b></div>
        ${bill.company_address ? `<div class="muted">${esc(bill.company_address)}</div>` : ''}
        ${bill.company_contact_person ? `<div class="muted">Kind attn: ${esc(bill.company_contact_person)}</div>` : ''}
        ${bill.company_phone ? `<div class="muted">${esc(bill.company_phone)}</div>` : ''}
        ${bill.company_gstin ? `<div class="muted">GSTIN: ${esc(bill.company_gstin)}</div>` : ''}
      </div>
      <div class="party-box">
        <div class="party-label">Statement covers</div>
        <div>${bill.items && bill.items.length ? `${bill.items.length} trip(s)` : 'No line items'}</div>
        ${bill.items && bill.items.length ? `<div class="muted">${esc(fmtDate(bill.items[0].trip_date))} to ${esc(fmtDate(bill.items[bill.items.length - 1].trip_date))}</div>` : ''}
        ${bill.note ? `<div class="muted">${esc(bill.note)}</div>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:90px">Date</th>
          <th>Particulars</th>
          <th style="width:100px">Vehicle</th>
          <th class="num" style="width:90px">Rate</th>
          <th class="num" style="width:110px">Amount</th>
          <th class="num" style="width:90px">Advance</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || '<tr><td colspan="6">No line items.</td></tr>'}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row"><span>Previous balance</span><span class="num">${fmt(bill.previous_balance)}</span></div>
      <div class="totals-row"><span>Subtotal (this bill)</span><span class="num">${fmt(bill.subtotal)}</span></div>
      <div class="totals-row"><span>Less: advances received</span><span class="num">- ${fmt(bill.total_advance)}</span></div>
      <div class="totals-row totals-due"><span>Balance due</span><span class="num">${fmt(remaining)}</span></div>
      <div class="totals-row"><span>Paid</span><span class="num">${fmt(bill.amount_paid)}</span></div>
    </div>

    <div class="words"><b>Amount in words (balance due):</b> ${esc(
      (bill.remaining_balance_in_words || bill.balance_due_in_words || '').replace(/^Rupees /, '')
    )}</div>

    ${
      paymentRows
        ? `
    <div class="payments">
      <h3>Payments received</h3>
      <table>
        <thead><tr><th style="width:110px">Date</th><th style="width:140px">Mode</th><th>Note</th><th class="num" style="width:130px">Amount</th></tr></thead>
        <tbody>${paymentRows}</tbody>
      </table>
    </div>`
        : ''
    }

    <div class="account">
      <b>To be paid to the following account:</b><br>
      A/C NO. — ____________________<br>
      IFSC CODE — ____________________ &nbsp; [BANK]<br>
      NAME — ____________________
    </div>

    <div class="sign">
      <div class="sign-line">Received by</div>
      <div class="sign-line" style="text-align:right">For ${esc(bill.organization_name || '')} — Authorised Signatory</div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { billHtml };
