import Tesseract from 'tesseract.js';

/**
 * Common Indian Fuel Station Brands Heuristic
 */
const FUEL_BRANDS = [
  { name: 'Indian Oil Corporation Ltd', regex: /indian\s*[o0q]il|indianoqil|iocl|swagat|kisan\s*seva/i },
  { name: 'Bharat Petroleum (BPCL)', regex: /bharat\s*petroleum|bpcl|pure\s*for\s*sure|speed|mak/i },
  { name: 'Hindustan Petroleum (HPCL)', regex: /hindustan\s*petroleum|hpcl|club\s*hp|power/i },
  { name: 'Shell India', regex: /shell\s*india|shell/i },
  { name: 'Nayara Energy', regex: /nayara|essar/i },
  { name: 'Reliance Petroleum (Jio-bp)', regex: /reliance|jio[- ]?bp/i }
];

/**
 * Parse raw OCR text from an Indian fuel receipt into structured fields using
 * contextual line-by-line inspection and mathematical sanity checks.
 */
export function parseFuelReceiptText(rawText) {
  if (!rawText || typeof rawText !== 'string') return {};

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const result = {
    bill_number: '',
    fuel_station: '',
    date: '',
    liters: '',
    cost_per_liter: '',
    amount: '',
    vehicle_registration: '',
    odometer: '',
    raw_text: rawText,
    confidence_flags: {}
  };

  const textLower = rawText.toLowerCase();

  // 1. Detect Fuel Station Brand (with OCR character substitution tolerance)
  for (const brand of FUEL_BRANDS) {
    if (brand.regex.test(textLower)) {
      result.fuel_station = brand.name;
      result.confidence_flags.fuel_station = true;
      break;
    }
  }
  // Fallback to merchant heading if unrecognized
  if (!result.fuel_station && lines.length > 0) {
    const firstClean = lines[0].replace(/[^\w\s\.\-]/g, '').trim();
    if (firstClean.length >= 4 && firstClean.length <= 40) {
      result.fuel_station = firstClean;
    }
  }

  // 2. Line-by-line contextual parsing
  for (const line of lines) {
    const lineLower = line.toLowerCase();

    // Bill / Invoice / Receipt / Memo Number
    if (!result.bill_number && /(?:receipt|rcpt|inv(?:oice)?|bill|slip|txn|memo|doc)\s*(?:no\.?|#|id)?[:\s\-]*([a-z0-9\-\/]{3,25})/i.test(line)) {
      const m = line.match(/(?:receipt|rcpt|inv(?:oice)?|bill|slip|txn|memo|doc)\s*(?:no\.?|#|id)?[:\s\-]*([a-z0-9\-\/]{3,25})/i);
      if (m && m[1]) {
        const candidate = m[1].trim();
        if (!/^(date|cash|card|total|pump|time|sale|rate|diesel|petrol|online|mode)$/i.test(candidate)) {
          result.bill_number = candidate.toUpperCase();
          result.confidence_flags.bill_number = true;
        }
      }
    }

    // Vehicle Registration (from explicit "VEH NO:" or line containing vehicle plate)
    if (!result.vehicle_registration) {
      if (/veh(?:icle)?\s*(?:no\.?|#)?/i.test(lineLower)) {
        const m = line.match(/([a-z]{2}\s*[0-9]{1,2}\s*[a-z]{1,3}\s*[0-9]{4})/i);
        if (m && m[1]) {
          result.vehicle_registration = m[1].replace(/\s+/g, '').toUpperCase();
          result.confidence_flags.vehicle_registration = true;
        }
      }
    }

    // Rate / Price per Liter (Explicitly requires RATE/PRICE/RSP and NOT Volume/Qty)
    if (!result.cost_per_liter && /(?:rate|price|rsp)(?:\/ltr|\/l)?/i.test(lineLower) && !/density/i.test(lineLower)) {
      // Find all numbers on the line and pick the rate (typically ₹60 to ₹180 in India)
      const numMatches = line.match(/\b([0-9]{2,3}(?:\.[0-9]{1,2})?)\b/g);
      if (numMatches) {
        for (const numStr of numMatches) {
          const val = parseFloat(numStr);
          if (val >= 60 && val <= 180) {
            result.cost_per_liter = val.toFixed(2);
            result.confidence_flags.cost_per_liter = true;
            break;
          }
        }
      }
    }

    // Volume / Liters (Must contain VOLUME, VOL, QTY, LITRE and MUST NOT contain RATE, PRICE, RSP, DENSITY)
    if (!result.liters && /(?:volume|vol(?:\(ltr\))?|qty|quantity|litres?|ltrs?)/i.test(lineLower) && !/(?:rate|price|rsp|density)/i.test(lineLower)) {
      // e.g. "VOLUME(LTR.): 33.78 LT", "QTY: 42.50 L"
      const numMatches = line.match(/([0-9]{1,4}(?:\.[0-9]{1,3})?)/g);
      if (numMatches) {
        for (const numStr of numMatches) {
          const val = parseFloat(numStr);
          if (val > 0 && val < 1000) {
            result.liters = val.toFixed(2);
            result.confidence_flags.liters = true;
            break;
          }
        }
      }
    }

    // Amount (Must contain AMOUNT, TOTAL, NET AMOUNT, SALE and MUST NOT contain RATE, PRICE, DENSITY, VAT, GST)
    if (!result.amount && /(?:amount|total|net\s*amount|sale)/i.test(lineLower) && !/(?:rate|price|rsp|density|tax|vat|gst)/i.test(lineLower)) {
      // e.g. "AMOUNT: 3500", "NET AMOUNT: Rs 4114.00"
      const numMatches = line.match(/([0-9]{2,6}(?:\.[0-9]{1,2})?)/g);
      if (numMatches) {
        for (const numStr of numMatches) {
          const val = parseFloat(numStr);
          if (val >= 50 && val <= 500000) {
            result.amount = val.toFixed(2);
            result.confidence_flags.amount = true;
            break;
          }
        }
      }
    }

    // Date: DD/MM/YYYY (Indian standard fuel receipt date format)
    if (!result.date && /date/i.test(lineLower)) {
      const dm = line.match(/(\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b)/);
      if (dm && dm[1]) {
        const parts = dm[1].replace(/[\-\.]/g, '/').split('/');
        if (parts.length === 3) {
          let day = parseInt(parts[0], 10);
          let month = parseInt(parts[1], 10);
          let year = parseInt(parts[2], 10);
          if (year < 100) year += 2000;
          if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            result.date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            result.confidence_flags.date = true;
          }
        }
      }
    }

    // Odometer
    if (!result.odometer && /(?:odometer|odo(?:\s*reading)?|km(?:\s*reading)?)/i.test(lineLower)) {
      const om = line.match(/([0-9]{4,7})/);
      if (om && om[1]) {
        result.odometer = om[1];
        result.confidence_flags.odometer = true;
      }
    }
  }

  // Fallback vehicle search anywhere in text if not found in labeled line
  if (!result.vehicle_registration) {
    const vm = rawText.match(/\b([A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4})\b/);
    if (vm && vm[1]) {
      result.vehicle_registration = vm[1].toUpperCase();
      result.confidence_flags.vehicle_registration = true;
    }
  }

  // 3. Mathematical Consistency & Reconciliation
  const ltr = parseFloat(result.liters);
  const rate = parseFloat(result.cost_per_liter);
  const amt = parseFloat(result.amount);

  if (ltr > 0 && rate > 0) {
    const calculatedAmt = ltr * rate;
    if (!amt) {
      result.amount = calculatedAmt.toFixed(2);
      result.confidence_flags.amount = true;
    }
  } else if (amt > 0 && rate > 0 && !ltr) {
    result.liters = (amt / rate).toFixed(2);
    result.confidence_flags.liters = true;
  } else if (amt > 0 && ltr > 0 && !rate) {
    result.cost_per_liter = (amt / ltr).toFixed(2);
    result.confidence_flags.cost_per_liter = true;
  }

  return result;
}

/**
 * Run OCR scan on an image file (Blob/File/URL) using Tesseract.js.
 */
export async function scanReceiptWithOcr(imageSource, onProgress = () => {}) {
  try {
    const { data } = await Tesseract.recognize(
      imageSource,
      'eng',
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const pct = Math.round((m.progress || 0) * 100);
            onProgress({ status: 'Scanning receipt text…', progress: pct });
          } else {
            onProgress({ status: m.status, progress: 0 });
          }
        }
      }
    );

    const parsed = parseFuelReceiptText(data.text);
    return {
      success: true,
      text: data.text,
      confidence: data.confidence,
      extracted: parsed
    };
  } catch (err) {
    console.error('OCR Scanning Error:', err);
    return {
      success: false,
      error: err.message || 'Failed to scan receipt image.'
    };
  }
}

/**
 * Pre-calibrated sample receipts for demonstration & testing
 */
export const SAMPLE_RECEIPTS = [
  {
    id: 'iocl_nh48',
    label: 'Indian Oil Slip (#INV-2025-6554)',
    station: 'Indian Oil Corporation Ltd',
    billNumber: 'INV-2025-6554',
    liters: '33.78',
    rate: '103.62',
    amount: '3500.00',
    vehicleReg: 'MH47BP4346',
    date: '2025-01-04',
    sampleText: `
IndianOQil
WELCOME!!! |
ROHAN GUPTA
23 HILLTOP COLONY, HYDERABAD, DELHI 116612"
GSTIN 28NKQOW3518T1Z5
TEL. NO.:
RECEIPT NO.: INV-2025-6554
LOCAL ID: 67369873
FCC ID: -
FIP NO.: 05
NOZZLE NO.: 01
PRODUCT: PETROL
RATE/LTR: 2 103.62
DENSITY: 733.5 KG/M3
AMOUNT: 3500
VOLUME(LTR.): 33.78 LT
VEH TYPE: PETROL
VEH NO: MH47BP4346
CUSTOMER NAME: AARAV SINGH
DATE: 04/01/2025 TIME: 16:03
MODE: ONLINE
GSTIN: 28NKQOW3518T1Z5
SAVE FUEL YAANI SAVE MONEY !! THANKS FOR
FUELLING WITH US.
    `
  },
  {
    id: 'bpcl_city',
    label: 'Bharat Petroleum City Hub (#BP-38204)',
    station: 'Bharat Petroleum (BPCL)',
    billNumber: 'BP-38204',
    liters: '42.50',
    rate: '96.80',
    amount: '4114.00',
    vehicleReg: 'MH12DE3910',
    date: new Date().toISOString().slice(0, 10),
    sampleText: `
BHARAT PETROLEUM CORP LTD
SPEED AUTO SERVICES
BILL NO: BP-38204
--------------------------------
DATE: ${new Date().toLocaleDateString('en-GB')}
PRODUCT: DIESEL
DENSITY: 832.4 kg/m3
RATE/LTR: Rs 96.80
VOLUME(LTR.): 42.50 LT
AMOUNT: 4114.00
VEH NO: MH12DE3910
THANK YOU VISIT AGAIN
    `
  },
  {
    id: 'hpcl_express',
    label: 'HPCL Express Logistics (#HP-59102)',
    station: 'Hindustan Petroleum (HPCL)',
    billNumber: 'HP-59102',
    liters: '78.00',
    rate: '96.70',
    amount: '7542.60',
    vehicleReg: 'GJ01AB4920',
    date: new Date().toISOString().slice(0, 10),
    sampleText: `
HINDUSTAN PETROLEUM CORP LTD
CLUB HP LOGISTICS PARK
SLIP NO: HP-59102
DATE: ${new Date().toLocaleDateString('en-GB')}
RATE/LTR: Rs 96.70
VOLUME(LTR.): 78.00 LT
AMOUNT: 7542.60
ODO READING: 58240 KM
VEH NO: GJ01AB4920
CASH MEMO - ORIGINAL
    `
  }
];
