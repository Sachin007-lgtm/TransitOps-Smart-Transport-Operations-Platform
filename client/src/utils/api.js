export const TOKEN_KEY = 'transitops_token';
export const USER_KEY = 'transitops_user';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('token');
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export function storeAuthSession(token, user) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function clearStoredAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('token');
  localStorage.removeItem('userRole');
  localStorage.removeItem('organization_id');
}

export async function apiRequest(method, path, body = null, explicitToken = null) {
  const token = explicitToken !== null ? explicitToken : getStoredToken();
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
    // Only dispatch unauthorized event if an authenticated request failed
    if (token) {
      clearStoredAuth();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('transitops-unauthorized'));
      }
    }
    let errorMsg = 'Unauthorized';
    try {
      const errJson = await response.json();
      errorMsg = errJson.error || errJson.message || errorMsg;
    } catch (_) {}
    const err = new Error(errorMsg);
    err.status = 401;
    throw err;
  }

  const json = await response.json();
  if (!response.ok) {
    const error = new Error(json.error || json.message || 'API request failed');
    error.status = response.status;
    throw error;
  }

  return json;
}

/**
 * Open a server-rendered document (e.g. a print-ready bill) in a new tab.
 *
 * The document endpoint is JWT-protected, so it cannot be reached with a plain
 * <a href>; the token travels with the request and the result is opened from a
 * blob URL instead. Follows the same token and 401 conventions as apiRequest so
 * a stale session behaves identically whichever call hits it first.
 */
export async function apiOpenDocument(path, explicitToken = null) {
  const token = explicitToken !== null ? explicitToken : getStoredToken();

  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (response.status === 401) {
    clearStoredAuth();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('transitops-unauthorized'));
    }
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  if (!response.ok) {
    let message = 'Could not load the document.';
    try {
      const json = await response.json();
      message = json.error || json.message || message;
    } catch (_) {
      /* non-JSON error body */
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const html = await response.text();
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const opened = window.open(url, '_blank');
  if (opened) {
    // Revoke later: revoking immediately can cancel the load in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else {
    URL.revokeObjectURL(url);
  }
  return opened;
}

