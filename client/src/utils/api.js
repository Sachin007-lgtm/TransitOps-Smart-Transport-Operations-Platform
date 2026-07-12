
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
    throw new Error(json.message || 'API request failed');
  }

  return json;
}
