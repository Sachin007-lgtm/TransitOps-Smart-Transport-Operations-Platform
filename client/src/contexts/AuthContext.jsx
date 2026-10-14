import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest, getStoredToken, getStoredUser, storeAuthSession, clearStoredAuth } from '../utils/api';

const AuthContext = createContext(null);

const ALLOWED_WEB_ROLES = ['Platform Admin', 'Owner/Manager'];

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    const t = getStoredToken();
    const u = getStoredUser();
    return (t && u && ALLOWED_WEB_ROLES.includes(u.role)) ? t : null;
  });
  const [user, setUser] = useState(() => {
    const u = getStoredUser();
    return (u && ALLOWED_WEB_ROLES.includes(u.role)) ? u : null;
  });
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
          if (!ALLOWED_WEB_ROLES.includes(freshUser?.role)) {
            clearStoredAuth();
            setToken(null);
            setUser(null);
          } else {
            setToken(existingToken);
            setUser(freshUser);
            storeAuthSession(existingToken, freshUser);
          }
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
        password,
        client: 'web'
      });

      const { token: authToken, user: authUser } = response.data;
      if (!ALLOWED_WEB_ROLES.includes(authUser?.role)) {
        clearStoredAuth();
        setToken(null);
        setUser(null);
        throw new Error('Driver accounts are not authorized to access the web dashboard. Please sign in using the TransitOps Driver mobile app.');
      }
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

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const trimmedCurrent = String(currentPassword || '').trim();
    const trimmedNew = String(newPassword || '');

    if (!trimmedCurrent || !trimmedNew) {
      throw new Error('Please enter both your current password and new password.');
    }
    if (trimmedNew.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }

    const currentToken = getStoredToken();
    const res = await apiRequest('PATCH', '/auth/password', {
      current_password: trimmedCurrent,
      new_password: trimmedNew
    }, currentToken);

    // Refresh profile to update must_change_password flag in active state
    try {
      const meRes = await apiRequest('GET', '/auth/me', null, currentToken);
      if (meRes?.data) {
        setUser(meRes.data);
        storeAuthSession(currentToken, meRes.data);
      }
    } catch {
      // If fetching me fails, at least clear the local flag
      setUser(prev => prev ? { ...prev, must_change_password: false } : prev);
    }

    return res;
  }, []);

  const updateProfile = useCallback(async (profileData) => {
    const currentToken = getStoredToken();
    const res = await apiRequest('PATCH', '/auth/profile', profileData, currentToken);
    const updatedUser = res?.data || res;
    if (updatedUser) {
      setUser(prev => {
        const merged = { ...prev, ...updatedUser };
        if (currentToken) storeAuthSession(currentToken, merged);
        return merged;
      });
    }
    return updatedUser;
  }, []);

  const value = {
    user,
    token,
    isAuthenticated: Boolean(token && user),
    isLoading,
    login,
    logout,
    changePassword,
    updateProfile
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
