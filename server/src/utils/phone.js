function normalizePhoneNumber(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  return `+${digits}`;
}

module.exports = { normalizePhoneNumber };