// Indian-format number to words ("Rupees Two Lakh Seventy Four Thousand Five
// Hundred Only") — the "Amount in words" line on the owner's bills.
const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return TENS[tens] + (ones ? ' ' + ONES[ones] : '');
}

function threeDigits(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let out = '';
  if (hundreds) out += ONES[hundreds] + ' Hundred';
  if (rest) out += (out ? ' ' : '') + twoDigits(rest);
  return out;
}

// Convert a non-negative integer to Indian-grouped words (crore / lakh /
// thousand / hundred). Supports up to 99,99,99,999 — far beyond any bill.
function integerToIndianWords(num) {
  if (num === 0) return 'Zero';
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rest = num % 1000;

  const parts = [];
  if (crore) parts.push(twoDigits(crore) + ' Crore');
  if (lakh) parts.push(twoDigits(lakh) + ' Lakh');
  if (thousand) parts.push(twoDigits(thousand) + ' Thousand');
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ');
}

function numberToWords(amount) {
  const value = Math.abs(parseFloat(amount) || 0);
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);
  let out = 'Rupees ' + integerToIndianWords(rupees);
  if (paise > 0) {
    out += ' and ' + twoDigits(paise) + ' Paise';
  }
  return out + ' Only';
}

module.exports = { numberToWords, integerToIndianWords };
