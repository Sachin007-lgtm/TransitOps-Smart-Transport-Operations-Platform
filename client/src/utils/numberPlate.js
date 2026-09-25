/**
 * Client-side Indian Vehicle Number Plate Utilities.
 * Standard Indian format: SS-RR-XX-NNNN (e.g. MH-01-AB-1234, GJ-01-XY-1001)
 * or Bharat Series: YY-BH-NNNN-XX (e.g. 22-BH-1234-AA)
 */

export const INDIAN_STATE_CODES = new Set([
  'AN', 'AP', 'AR', 'AS', 'BR', 'CH', 'CG', 'CH', 'DD', 'DN',
  'DL', 'GA', 'GJ', 'HR', 'HP', 'JK', 'JH', 'KA', 'KL', 'LA',
  'LD', 'MP', 'MH', 'MN', 'ML', 'MZ', 'NL', 'OD', 'OR', 'PB',
  'PY', 'RJ', 'SK', 'TN', 'TS', 'TR', 'UP', 'UK', 'UA', 'WB'
]);

export function formatIndianNumberPlate(val) {
  if (!val) return '';
  const clean = val.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // 1. Bharat Series (BH)
  const bhMatch = clean.match(/^(\d{2})BH(\d{4})([A-Z]{1,2})$/);
  if (bhMatch) {
    return `${bhMatch[1]}-BH-${bhMatch[2]}-${bhMatch[3]}`;
  }

  // 2. Standard State/RTO Series
  const stdMatch = clean.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/);
  if (stdMatch) {
    const state = stdMatch[1];
    const rto = stdMatch[2].padStart(2, '0');
    const series = stdMatch[3];
    const serial = stdMatch[4].padStart(4, '0');
    return `${state}-${rto}-${series}-${serial}`;
  }

  return val.toUpperCase();
}

export function validateIndianNumberPlate(val) {
  if (!val || !val.trim()) return 'Number plate is required.';

  const clean = val.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  // 1. Check Bharat Series (BH)
  const bhMatch = clean.match(/^(\d{2})BH(\d{4})([A-Z]{1,2})$/);
  if (bhMatch) return null;

  // 2. Standard State/RTO Series
  const stdMatch = clean.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/);
  if (!stdMatch) {
    return 'Invalid format. Must follow Indian number plate format: SS-RR-XX-NNNN (e.g. MH-01-AB-1234).';
  }

  const state = stdMatch[1];
  if (!INDIAN_STATE_CODES.has(state)) {
    return `Invalid state code '${state}'. Must be a valid 2-letter Indian State/UT code (e.g. MH, DL, GJ, KA).`;
  }

  const serial = stdMatch[4].padStart(4, '0');
  if (serial === '0000') {
    return 'Registration sequence number cannot be 0000.';
  }

  return null;
}
