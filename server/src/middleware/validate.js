const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validate = (schema = {}) => {
  return (req, res, next) => {
    if (!schema || typeof schema !== 'object') return next();
    req.body = req.body || {};
    const errors = [];
    
    for (const [key, rules] of Object.entries(schema)) {
      const val = req.body[key];
      
      if (rules.required && (val === undefined || val === null || val === '')) {
        errors.push(`${key} is required.`);
        continue;
      }
      
      if (val !== undefined && val !== null && val !== '') {
        if (rules.type === 'number') {
          const num = Number(val);
          if (isNaN(num)) {
            errors.push(`${key} must be a number.`);
          } else if (rules.positive && num <= 0) {
            errors.push(`${key} must be a positive number.`);
          }
        } else if (rules.type === 'integer') {
          const num = Number(val);
          if (!Number.isInteger(num)) {
            errors.push(`${key} must be an integer.`);
          } else if (rules.positive && num <= 0) {
            errors.push(`${key} must be a positive integer.`);
          }
        } else if (rules.type === 'uuid') {
          if (typeof val !== 'string' || !UUID_REGEX.test(val.trim())) {
            errors.push(`${key} must be a valid UUID.`);
          }
        } else if (rules.type === 'string' && typeof val !== 'string') {
          errors.push(`${key} must be a string.`);
        } else if (rules.type === 'date') {
          const d = new Date(val);
          if (isNaN(d.getTime())) {
            errors.push(`${key} must be a valid date.`);
          }
        } else if (rules.type === 'enum' && Array.isArray(rules.enum) && !rules.enum.includes(val)) {
          errors.push(`${key} must be one of: ${rules.enum.join(', ')}.`);
        }
        
        if (typeof rules.custom === 'function') {
          const customErr = rules.custom(val, req.body);
          if (customErr) errors.push(customErr);
        }
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors.join('; '),
        errors
      });
    }
    
    next();
  };
};

module.exports = validate;
