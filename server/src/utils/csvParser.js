/**
 * Minimal CSV parser (no external dependency).
 *
 * Splits text into header + rows. Handles:
 *   - CRLF / LF line endings
 *   - Quoted fields containing commas, newlines, or escaped quotes ("")
 *   - Blank lines (skipped)
 *
 * Header normalization:
 *   Every owner brings their own column names, so headers are folded to a
 *   canonical key: trimmed, lowercased, and all punctuation/whitespace stripped
 *   (e.g. "Vehicle Number", "vehicle_number", "VehicleNumber" all -> "vehiclenumber").
 *   Unknown columns are preserved under their normalized key so callers can
 *   match against their own alias sets; they are simply ignored if unmatched.
 *
 * @param {string} text - raw CSV text
 * @returns {{headers: string[], rows: Array<Record<string,string>>}}
 */
function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s\-]+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Parse a single CSV line into fields, respecting double-quote escaping.
 */
function parseLine(line) {
  const fields = [];
  let i = 0;
  const len = line.length;
  while (i < len) {
    let field = '';
    if (line[i] === '"') {
      // Quoted field.
      i++; // skip opening quote
      while (i < len) {
        if (line[i] === '"') {
          if (i + 1 < len && line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          field += line[i];
          i++;
        }
      }
      // Skip characters until the next comma or end of line.
      while (i < len && line[i] !== ',') i++;
      if (i < len) i++; // skip the comma
    } else {
      while (i < len && line[i] !== ',') {
        field += line[i];
        i++;
      }
      if (i < len) i++; // skip the comma
    }
    fields.push(field);
  }
  return fields;
}

function parseCsv(text) {
  if (typeof text !== 'string') {
    throw new Error('CSV input must be a string.');
  }

  // Normalize line endings, then split. Keep empty trailing line out.
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  // Drop leading blank lines.
  let start = 0;
  while (start < lines.length && lines[start].trim() === '') start++;
  if (start >= lines.length) return { headers: [], rows: [] };

  const rawHeaders = parseLine(lines[start]);
  const headers = rawHeaders.map(normalizeHeader);

  const rows = [];
  for (let li = start + 1; li < lines.length; li++) {
    const line = lines[li];
    if (line.trim() === '') continue; // skip blank rows
    const fields = parseLine(line);
    if (fields.every((f) => f.trim() === '')) continue; // skip fully-empty rows
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = fields[idx] !== undefined ? fields[idx] : '';
    });
    // Capture any trailing fields beyond the header count under synthetic keys.
    for (let fi = headers.length; fi < fields.length; fi++) {
      row[`_col_${fi + 1}`] = fields[fi];
    }
    rows.push(row);
  }

  return { headers, rows };
}

module.exports = { parseCsv, normalizeHeader };
