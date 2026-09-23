
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
    // The session is gone (expired token, or one signed with a different
    // secret). Drop it, remember where the user was, and send them to sign in
    // — login hands the page back instead of dumping them on the dashboard.
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    if (!window.location.pathname.startsWith('/login')) {
      localStorage.setItem('redirectAfterLogin', window.location.pathname + window.location.search);
    }
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error || json.message || 'API request failed');
  }

  return json;
}

/**
 * Open a server-rendered document (e.g. a printable bill) in a new tab.
 * The document endpoint is JWT-protected, so it cannot be linked with a plain
 * <a href>; the token is sent with the request and the result is opened from a
 * blob URL instead.
 */
export async function apiOpenDocument(path) {
  const token = localStorage.getItem('token');

  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    let message = 'Could not load the document.';
    try {
      const json = await response.json();
      message = json.error || json.message || message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }

  const html = await response.text();
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const opened = window.open(url, '_blank');
  // Revoke later: revoking immediately can cancel the load in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  if (!opened) URL.revokeObjectURL(url);
  return opened;
}
