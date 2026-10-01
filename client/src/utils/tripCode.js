/**
 * Human-readable trip code, shared by every screen that names a trip
 * (tracking cards, trip history, map callout).
 *
 * Ids are UUIDs, so a card cannot print them in full. The code takes the
 * first 8 hex characters, uppercased: TR-01A0EEA1. Short enough to read,
 * long enough that a collision inside one organization is unrealistic, and
 * the same convention everywhere so a trip is named identically on every
 * screen.
 */
export const tripCode = (id) => {
  if (!id) return 'TR---------';
  return 'TR-' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase();
};
