import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest, getStoredToken, getStoredUser, storeAuthSession, clearStoredAuth } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(() => getStoredUser());
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from server on mount
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      const existingToken = getStoredToken();
      if (!existingToken) {
        if (isMounted) {
          clearStoredAuth();
          setToken(null);
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const response = await apiRequest('GET', '/auth/me', null, existingToken);
        if (isMounted && response?.data) {
          const freshUser = response.data;
          setToken(existingToken);
          setUser(freshUser);
          storeAuthSession(existingToken, freshUser);
        }
      } catch (error) {
        if (isMounted) {
          clearStoredAuth();
          setToken(null);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    // Listen for unauthorized 401 events dispatched by api.js
    const handleUnauthorized = () => {
      if (isMounted) {
        clearStoredAuth();
        setToken(null);
        setUser(null);
      }
    };

    window.addEventListener('transitops-unauthorized', handleUnauthorized);

    return () => {
      isMounted = false;
      window.removeEventListener('transitops-unauthorized', handleUnauthorized);
    };
  }, []);

  const login = useCallback(async (identifier, password) => {
    const trimmed = String(identifier || '').trim();
    if (!trimmed || !password) {
      throw new Error('Please enter your email or phone number and password.');
    }

    try {
      const response = await apiRequest('POST', '/auth/login', {
        identifier: trimmed,
        email: trimmed,
        password
      });

      const { token: authToken, user: authUser } = response.data;
      storeAuthSession(authToken, authUser);
      setToken(authToken);
      setUser(authUser);
      return authUser;
    } catch (error) {
      clearStoredAuth();
      setToken(null);
      setUser(null);
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setToken(null);
    setUser(null);
  }, []);

  const value = {
    user,
    token,
    isAuthenticated: Boolean(token && user),
    isLoading,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
