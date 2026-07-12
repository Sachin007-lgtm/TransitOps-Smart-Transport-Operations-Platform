const convertToCSV = (data) => {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      if (val === null || val === undefined) return '';
      
      const escaped = ('' + val).replace(/"/g, '""');
      // If value contains comma, newline, or quotes, wrap it in double quotes
      return escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')
        ? `"${escaped}"`
        : escaped;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
};

const sendCSVResponse = (res, filename, data) => {
  const csvContent = convertToCSV(data);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  return res.status(200).send(csvContent);
};

module.exports = {
  convertToCSV,
  sendCSVResponse
};
