// Status options for filtering in toolbar (Matching Vehicles.jsx standard)
export const DRIVER_STATUS_FILTERS = ['All', 'Available', 'On Trip', 'Off Duty', 'Suspended'];

// Popular and relevant Indian driving license categories
export const INDIAN_LICENSE_CATEGORIES = [
  { value: 'LMV-TR', label: 'LMV-TR (Light Motor Vehicle - Transport)' },
  { value: 'LMV-NT', label: 'LMV-NT (Light Motor Vehicle - Non-Transport)' },
  { value: 'HMV / HGMV', label: 'HMV / HGMV (Heavy Goods Motor Vehicle)' },
  { value: 'HPMV / HTV', label: 'HPMV / HTV (Heavy Transport / Passenger Vehicle)' },
  { value: 'MGV', label: 'MGV (Medium Goods Vehicle)' },
  { value: 'Trailer', label: 'Trailer (Multi-Axle / Articulated Trailer)' },
  { value: 'MCWG', label: 'MCWG (Motorcycle with Gear)' },
  { value: 'MCWOG / FVG', label: 'MCWOG / FVG (Motorcycle without Gear)' },
  { value: 'MC 50CC', label: 'MC 50CC (Motorcycle 50cc or less)' }
];

// Normalizer and validator for Indian driving license number: SS-RR-YYYY-NNNNNNN
export const formatIndianLicenseNumber = (val) => {
  if (!val) return '';
  const clean = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length === 15) {
    return `${clean.slice(0, 2)}-${clean.slice(2, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 15)}`;
  }
  return val.toUpperCase();
};

export const validateIndianLicenseNumber = (val) => {
  if (!val || !val.trim()) return 'License number is required.';
  const clean = val.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 15) {
    return 'License number must follow 15-character Indian format: SS-RR-YYYY-NNNNNNN (e.g. MH-02-2020-0001234).';
  }
  const state = clean.slice(0, 2);
  const rto = clean.slice(2, 4);
  const year = clean.slice(4, 8);
  const serial = clean.slice(8, 15);
  if (!/^[A-Z]{2}$/.test(state)) return 'State code must be 2 letters (e.g. MH, DL, KA).';
  if (!/^\d{2}$/.test(rto)) return 'RTO code must be 2 digits (e.g. 01, 02).';
  if (!/^\d{4}$/.test(year)) return 'Issue year must be 4 digits (e.g. 2020).';
  if (!/^\d{7}$/.test(serial)) return 'Serial number must be 7 digits (e.g. 0001234).';
  return null;
};

export const isLicenseExpired = (expiryDate) => {
  if (!expiryDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(expiryDate) < today;
};

export const isLicenseExpiringSoon = (expiryDate) => {
  if (!expiryDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = new Date(expiryDate) - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 && diffDays <= 30;
};

export const formatDateForInput = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};

export const formatExpiryMMDDYY = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
};

export const getLeftBorderColor = (status) => {
  switch (status) {
    case 'Available': return 'var(--status-green)';
    case 'On Trip': 
    case 'On trip': return 'var(--status-blue)';
    case 'Suspended': return 'var(--status-red)';
    default: return 'var(--status-gray)'; // Off Duty
  }
};

export const getAvatarColor = (name) => {
  const colors = ['#7a4a63', '#22a06b', '#2f6fed', '#e08a1e', '#6a5acd'];
  const index = name ? name.charCodeAt(0) % colors.length : 0;
  return colors[index];
};

// Realistic initial roster ensuring instant render while API syncs
export const INITIAL_DRIVERS = [
  {
    id: '01950000-0002-7000-8000-000000000001',
    name: 'Alex Kumar',
    license_number: 'DL-01-2019-0000001',
    license_category: 'LMV-TR',
    license_expiry_date: '2028-06-30',
    contact_number: '+91 9876543210',
    status: 'Available',
    trips_count: 0,
    must_change_password: false
  },
  {
    id: '01950000-0002-7000-8000-000000000002',
    name: 'Ravi Sharma',
    license_number: 'MH-02-2020-0000045',
    license_category: 'HMV / HGMV',
    license_expiry_date: '2027-12-31',
    contact_number: '+91 9123456780',
    status: 'Available',
    trips_count: 0,
    must_change_password: false
  },
  {
    id: '01950000-0002-7000-8000-000000000004',
    name: 'Vikram Singh',
    license_number: 'DL-04-2021-0000189',
    license_category: 'HMV / HGMV',
    license_expiry_date: '2028-09-15',
    contact_number: '+91 9811223344',
    status: 'Available',
    trips_count: 0,
    must_change_password: true
  },
  {
    id: '01950000-0002-7000-8000-000000000005',
    name: 'Sunita Patil',
    license_number: 'MH-12-2022-0000301',
    license_category: 'LMV-TR',
    license_expiry_date: '2029-04-20',
    contact_number: '+91 9822334455',
    status: 'Off Duty',
    trips_count: 0,
    must_change_password: false
  },
  {
    id: '01950000-0002-7000-8000-000000000006',
    name: 'Mohammed Irfan',
    license_number: 'KA-01-2020-0000542',
    license_category: 'Trailer',
    license_expiry_date: '2027-11-10',
    contact_number: '+91 9833445566',
    status: 'Available',
    trips_count: 0,
    must_change_password: false
  },
  {
    id: '01950000-0002-7000-8000-000000000007',
    name: 'Arjun Reddy',
    license_number: 'TS-09-2023-0000778',
    license_category: 'HPMV / HTV',
    license_expiry_date: '2029-08-05',
    contact_number: '+91 9844556677',
    status: 'Available',
    trips_count: 0,
    must_change_password: false
  },
  {
    id: '01950000-0002-7000-8000-000000000008',
    name: 'Rajesh Verma',
    license_number: 'UP-32-2019-0000912',
    license_category: 'MGV',
    license_expiry_date: '2027-02-28',
    contact_number: '+91 9855667788',
    status: 'Suspended',
    trips_count: 0,
    must_change_password: false
  },
  {
    id: '01950000-0002-7000-8000-000000000009',
    name: 'Manoj Tiwari',
    license_number: 'DL-08-2018-0000431',
    license_category: 'LMV-NT',
    license_expiry_date: '2026-10-18',
    contact_number: '+91 9866778899',
    status: 'Off Duty',
    trips_count: 0,
    must_change_password: false
  }
];
