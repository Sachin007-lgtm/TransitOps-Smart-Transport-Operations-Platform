/**
 * Column alias mapping for flexible CSV import.
 *
 * Every owner may ship a CSV with their own column names ("Vehicle Number",
 * "Vehicle_Number", "vehicle number", "Registration", "Reg No", ...). This
 * module maps each canonical DB field to an array of accepted aliases. The
 * first matching alias found in the CSV headers wins. Unknown/unmatched
 * columns are ignored silently.
 *
 * Canonical keys:
 *   vehicle: registration_number, type, size, max_load_capacity, odometer
 *   driver:   name, license_number, license_category, license_expiry_date, contact_number, status
 *
 * Usage:
 *   const { matchColumn, pickRow } = require('./columnMapper');
 *   const headerKey = matchColumn(headers, ['registration_number', 'vehicle_number', ...]);
 *   const val = row[headerKey];
 */

// Canonical field -> accepted alias list (lowercased, punctuation stripped,
// matching the normalizeHeader output of csvParser.js).
const VEHICLE_ALIASES = {
  registration_number: [
    'registrationnumber', 'vehicle_number', 'vehiclenumber', 'vehicleregistration',
    'registration', 'regno', 'regno.', 'regno', 'regno', 'reg_number', 'regno',
    'numberplate', 'number_plate', 'vehiclenumberplate', 'number plate', 'plate',
    'vehicleregistrationnumber', 'vehicleregno', 'registrationno'
  ],
  type: [
    'type', 'vehicletype', 'vehicle_type', 'vehicletype', 'category', 'fleet_type',
    'vehicletype', 'typeofvehicle', 'type of vehicle'
  ],
  size: [
    'size', 'vehiclesize', 'vehicle_size', 'sub_category', 'subcategory',
    'vehiclesubcategory', 'vehiclesub_category', 'vehiclesize'
  ],
  max_load_capacity: [
    'maxloadcapacity', 'max_load_capacity', 'loadcapacity', 'load_capacity',
    'maxload', 'max_load', 'capacity', 'maxcapacity', 'max_capacity', 'payload',
    'maxpayload', 'max_payload', 'loadcapacitykg', 'load_capacity_kg'
  ],
  odometer: [
    'odometer', 'distancecovered', 'distance_covered', 'distance', 'kmdriven',
    'km_driven', 'odometerreading', 'odometer_reading', 'currentodometer',
    'current_odometer', 'reading'
  ]
};

const DRIVER_ALIASES = {
  name: [
    'name', 'drivername', 'driver_name', 'fullname', 'full_name', 'drivernam',
    'driverfullname', 'driver_full_name', 'drivernamefull', 'drivername'
  ],
  license_number: [
    'licensenumber', 'license_number', 'licenseno', 'license_no', 'drivinglicence',
    'driving_license', 'dl', 'dlnumber', 'dl_number', 'licenseno', 'license',
    'licencenumber', 'licence_number', 'dlno'
  ],
  license_category: [
    'licensecategory', 'license_category', 'licensecat', 'licencecategory',
    'licence_category', 'category', 'dlcategory', 'dl_category',
    'licensetype', 'license_type'
  ],
  license_expiry_date: [
    'licenseexpirydate', 'license_expiry_date', 'licenceexpirydate',
    'licence_expiry_date', 'licenseexpiry', 'license_expiry', 'expirydate',
    'expiry_date', 'validity', 'validtill', 'valid_till', 'licensevalidtill',
    'license_valid_till', 'expiry', 'dateofexpiry', 'date_of_expiry',
    'licencerexpirydate', 'licence_expiry'
  ],
  contact_number: [
    'contactnumber', 'contact_number', 'phone', 'phonenumber', 'phone_number',
    'mobilenumber', 'mobile_number', 'contact', 'phoneno', 'phone_no',
    'contactno', 'contact_no', 'mobileno', 'mobile', 'whatsapp', 'whatsappnumber',
    'whatsapp_number'
  ],
  status: [
    'status', 'driverstatus', 'driver_status', 'currentstatus', 'current_status'
  ]
};

/**
 * Find the first CSV header key that matches any accepted alias for a canonical field.
 * Header keys are expected to already be normalized (see csvParser.normalizeHeader).
 *
 * @param {string[]} headers - normalized CSV header keys
 * @param {string[]} aliases - accepted alias strings (already normalized)
 * @returns {string|null} the matching header key, or null
 */
function matchColumn(headers, aliases) {
  const aliasSet = new Set(aliases.map((a) => String(a).toLowerCase().replace(/[_\s\-]+/g, '').replace(/[^a-z0-9]/g, '')));
  for (const h of headers) {
    if (aliasSet.has(h)) return h;
  }
  return null;
}

/**
 * Pick mapped values from a single row given a field->alias map and the row's headers.
 *
 * @param {Record<string,string>} row - a single parsed CSV row
 * @param {Object} fieldAliasMap - canonical field -> alias list
 * @param {string[]} headers - normalized header keys present in this CSV
 * @returns {Object} canonical field -> raw string value (only for matched fields)
 */
function pickRow(row, fieldAliasMap, headers) {
  const mapped = {};
  for (const [field, aliases] of Object.entries(fieldAliasMap)) {
    const headerKey = matchColumn(headers, aliases);
    if (headerKey !== null && row[headerKey] !== undefined && row[headerKey] !== '') {
      mapped[field] = row[headerKey];
    }
  }
  return mapped;
}

module.exports = { matchColumn, pickRow, VEHICLE_ALIASES, DRIVER_ALIASES };
