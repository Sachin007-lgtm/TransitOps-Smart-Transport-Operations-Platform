
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export async function apiRequest(method, path, body = null) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const options = {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {})
  };

  const response = await fetch(`${API_URL}${path}`, options);
  
  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error || json.message || 'API request failed');
  }

  return json;
}

// Download a file (e.g. the bill document) from an API path, carrying the
// auth token. Triggers a browser save via an object URL.
export async function apiDownload(path, filename) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_URL}${path}`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    let message = 'Download failed';
    try {
      const j = await response.json();
      message = j.message || message;
    } catch { /* not JSON */ }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
