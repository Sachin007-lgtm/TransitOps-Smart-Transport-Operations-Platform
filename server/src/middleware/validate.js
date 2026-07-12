const validate = (schema) => {
  return (req, res, next) => {
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
        } else if (rules.type === 'string' && typeof val !== 'string') {
          errors.push(`${key} must be a string.`);
        } else if (rules.type === 'enum' && Array.isArray(rules.enum) && !rules.enum.includes(val)) {
          errors.push(`${key} must be one of: ${rules.enum.join(', ')}.`);
        }
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }
    
    next();
  };
};

module.exports = validate;
