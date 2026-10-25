import Tesseract from 'tesseract.js';

/**
 * Common Indian Fuel Station Brands Heuristic
 */
const FUEL_BRANDS = [
  { name: 'Indian Oil Corporation Ltd', keywords: ['indian oil', 'iocl', 'indianoil', 'swagat', 'kisan seva'] },
  { name: 'Bharat Petroleum (BPCL)', keywords: ['bharat petroleum', 'bpcl', 'speed', 'pure for sure', 'mak'] },
  { name: 'Hindustan Petroleum (HPCL)', keywords: ['hindustan petroleum', 'hpcl', 'power', 'club hp'] },
  { name: 'Shell India', keywords: ['shell', 'v-power'] },
  { name: 'Nayara Energy', keywords: ['nayara', 'essar'] },
  { name: 'Reliance Petroleum (Jio-bp)', keywords: ['reliance', 'jio-bp', 'jio bp'] }
];

/**
 * Parse raw OCR text from a fuel receipt into structured fields.
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

  // 1. Detect Fuel Station Brand
  for (const brand of FUEL_BRANDS) {
    if (brand.keywords.some(k => textLower.includes(k))) {
      result.fuel_station = brand.name;
      result.confidence_flags.fuel_station = true;
      break;
    }
  }
  // Fallback to first line if looks like a merchant name
  if (!result.fuel_station && lines.length > 0) {
    const firstLine = lines[0].replace(/[^\w\s\.\-]/g, '').trim();
    if (firstLine.length >= 4 && firstLine.length <= 40) {
      result.fuel_station = firstLine;
    }
  }

  // 2. Detect Bill / Receipt / Invoice Number
  // Examples: "Bill No: 12048", "Inv No.: INV-4921", "Txn ID: 94821", "Receipt #: 4829"
  const billMatch = rawText.match(/(?:bill|inv(?:oice)?|slip|txn|trans(?:action)?|receipt|rcpt|memo|doc)\s*(?:no\.?|#|id)?[:\s\-]*([a-z0-9\-\/]{3,20})/i);
  if (billMatch && billMatch[1]) {
    // Avoid capturing words like "DATE" or "CASH" as bill number
    const val = billMatch[1].trim();
    if (!/^(date|cash|card|total|pump|time|sale|rate|diesel|petrol)$/i.test(val)) {
      result.bill_number = val.toUpperCase();
      result.confidence_flags.bill_number = true;
    }
  }

  // 3. Detect Date
  // Formats: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD/MM/YY
  const dateMatch = rawText.match(/(?:date[:\s]*)?(\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b)/i);
  if (dateMatch && dateMatch[1]) {
    const rawDate = dateMatch[1].replace(/\./g, '/').replace(/-/g, '/');
    const parts = rawDate.split('/');
    if (parts.length === 3) {
      let day = parseInt(parts[0], 10);
      let month = parseInt(parts[1], 10);
      let year = parseInt(parts[2], 10);

      // Handle 2-digit year (e.g. 26 -> 2026)
      if (year < 100) year += 2000;

      // Check if parts are MM/DD or DD/MM
      if (month > 12 && day <= 12) {
        const temp = day;
        day = month;
        month = temp;
      }

      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        result.date = formattedDate;
        result.confidence_flags.date = true;
      }
    }
  }

  // 4. Detect Liters / Volume
  // Examples: "Volume: 65.40 L", "Qty: 50.00", "Volume(L): 45.20", "Ltrs: 62.50"
  const volumeMatch = rawText.match(/(?:volume|vol|qty|quantity|litres?|ltrs?|vol\.?\s*\(l\))[:\s]*([0-9]+\.?[0-9]*)/i);
  if (volumeMatch && volumeMatch[1]) {
    const val = parseFloat(volumeMatch[1]);
    if (!isNaN(val) && val > 0 && val < 1000) {
      result.liters = val.toFixed(2);
      result.confidence_flags.liters = true;
    }
  }

  // 5. Detect Rate / Price per Liter
  // Examples: "Rate: 96.72", "Rate/L: 96.72", "Price/Ltr: 94.50", "RSP: 96.50"
  const rateMatch = rawText.match(/(?:rate(?:\/ltr|\/l)?|price(?:\/ltr|\/l)?|rsp)[:\s]*(?:₹|rs\.?)?[:\s]*([0-9]+\.?[0-9]*)/i);
  if (rateMatch && rateMatch[1]) {
    const val = parseFloat(rateMatch[1]);
    if (!isNaN(val) && val >= 50 && val <= 200) { // realistic fuel price range in India
      result.cost_per_liter = val.toFixed(2);
      result.confidence_flags.cost_per_liter = true;
    }
  }

  // 6. Detect Total Amount
  // Examples: "Total: 6,325.00", "Net Amount: 4,500", "Amount: 5210.50", "Sale: 6000"
  const amountMatch = rawText.match(/(?:total(?:\s*amount)?|net\s*amount|amount(?:\s*paid)?|grand\s*total|sale)[:\s]*(?:₹|rs\.?)?[:\s]*([0-9,]+\.?[0-9]*)/i);
  if (amountMatch && amountMatch[1]) {
    const cleanNum = amountMatch[1].replace(/,/g, '');
    const val = parseFloat(cleanNum);
    if (!isNaN(val) && val > 0 && val < 500000) {
      result.amount = val.toFixed(2);
      result.confidence_flags.amount = true;
    }
  }

  // Cross-check: If we have liters & rate, or liters & amount, compute missing value!
  if (result.liters && result.cost_per_liter && !result.amount) {
    const computed = parseFloat(result.liters) * parseFloat(result.cost_per_liter);
    result.amount = computed.toFixed(2);
    result.confidence_flags.amount = true;
  } else if (result.amount && result.cost_per_liter && !result.liters) {
    const computed = parseFloat(result.amount) / parseFloat(result.cost_per_liter);
    result.liters = computed.toFixed(2);
    result.confidence_flags.liters = true;
  } else if (result.amount && result.liters && !result.cost_per_liter) {
    const computed = parseFloat(result.amount) / parseFloat(result.liters);
    result.cost_per_liter = computed.toFixed(2);
    result.confidence_flags.cost_per_liter = true;
  }

  // 7. Detect Indian Vehicle Registration Number if printed
  // Pattern: GJ01AB1234, MH12CD5678, DL1A1234
  const vehMatch = rawText.match(/\b([A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4})\b/);
  if (vehMatch && vehMatch[1]) {
    result.vehicle_registration = vehMatch[1].toUpperCase();
    result.confidence_flags.vehicle_registration = true;
  }

  // 8. Detect Odometer reading if entered
  const odoMatch = rawText.match(/(?:odometer|odo(?:\s*reading)?|km(?:\s*reading)?)[:\s]*([0-9]{4,7})/i);
  if (odoMatch && odoMatch[1]) {
    result.odometer = odoMatch[1];
    result.confidence_flags.odometer = true;
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
            onProgress({ status: 'Scanning text…', progress: pct });
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
    id: 'iocl_highway',
    label: 'Indian Oil Highway Pump (#IOC-94821)',
    station: 'Indian Oil Corporation Ltd',
    billNumber: 'IOC-94821',
    liters: '64.20',
    rate: '96.75',
    amount: '6211.35',
    date: new Date().toISOString().slice(0, 10),
    sampleText: `
INDIAN OIL CORPORATION LTD
COCO HIGHWAY OUTLET NH-48
GSTIN: 24AAACI1681G1Z1
--------------------------------
DATE: ${new Date().toLocaleDateString('en-GB')}  TIME: 14:32
RECEIPT NO: IOC-94821
PUMP NO: 04  NOZZLE: 02
FUEL TYPE: DIESEL (HSD)
RATE / LTR: Rs 96.75
VOLUME: 64.20 LTR
TOTAL AMOUNT: Rs 6211.35
VEHICLE NO: GJ01AB4920
MODE: FLEET CARD
--------------------------------
SAVE FUEL YAANI SAVE MONEY
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
    date: new Date().toISOString().slice(0, 10),
    sampleText: `
BHARAT PETROLEUM CORP LTD
SPEED AUTO SERVICES
BILL NO: BP-38204
--------------------------------
DATE: ${new Date().toLocaleDateString('en-GB')}
PRODUCT: DIESEL
DENSITY: 832.4 kg/m3
RATE: Rs 96.80 / LTR
QTY: 42.50 L
NET AMOUNT: Rs 4114.00
VEHICLE: MH12DE3910
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
    date: new Date().toISOString().slice(0, 10),
    sampleText: `
HINDUSTAN PETROLEUM CORP LTD
CLUB HP LOGISTICS PARK
SLIP NO: HP-59102
DATE: ${new Date().toLocaleDateString('en-GB')}
RATE: Rs 96.70
VOL: 78.00 LTRS
TOTAL: Rs 7542.60
ODO READING: 58240 KM
CASH MEMO - ORIGINAL
    `
  }
];
