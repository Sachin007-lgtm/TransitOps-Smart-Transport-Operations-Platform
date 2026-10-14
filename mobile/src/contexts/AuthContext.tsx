import { getItem, setItem, deleteItem } from '@/utils/secureStorage';
import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';

import { ApiError } from '@/utils/api';
import { AuthUser, changePassword, getCurrentUser, login } from '@/features/auth/authApi';
import { stopBackgroundLocationUpdates } from '@/features/location/locationService';

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isSigningIn: boolean;
  isRestoring: boolean;
  signIn: (phoneNumber: string, password: string) => Promise<AuthUser>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const TOKEN_KEY = 'transitops.auth.token';
const USER_KEY = 'transitops.auth.user';
const ALLOWED_MOBILE_ROLES = ['Driver'];

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      try {
        const [storedToken, storedUser] = await Promise.all([
          getItem(TOKEN_KEY),
          getItem(USER_KEY),
        ]);

        if (storedToken && storedUser) {
          const cachedUser = JSON.parse(storedUser) as AuthUser;

          try {
            const currentUser = await getCurrentUser(storedToken);
            if (!ALLOWED_MOBILE_ROLES.includes(currentUser.role)) {
              await clearStoredSession();
            } else {
              setToken(storedToken);
              setUser(currentUser);
              await setItem(USER_KEY, JSON.stringify(currentUser));
            }
          } catch (error) {
            if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
              await clearStoredSession();
            } else if (cachedUser && ALLOWED_MOBILE_ROLES.includes(cachedUser.role)) {
              setToken(storedToken);
              setUser(cachedUser);
            } else {
              await clearStoredSession();
            }
          }
        }
      } catch {
        await Promise.all([
          deleteItem(TOKEN_KEY),
          deleteItem(USER_KEY),
        ]);
      } finally {
        setIsRestoring(false);
      }
    }

    void restoreSession();
  }, []);

  async function signIn(phoneNumber: string, password: string) {
    setIsSigningIn(true);

    try {
      const response = await login(phoneNumber, password);
      const authUser = response.data.user;
      if (!ALLOWED_MOBILE_ROLES.includes(authUser.role)) {
        throw new Error('Manager and Admin accounts cannot sign in to the driver mobile app. Please use the TransitOps Web Dashboard.');
      }
      setUser(authUser);
      setToken(response.data.token);
      await Promise.all([
        setItem(TOKEN_KEY, response.data.token),
        setItem(USER_KEY, JSON.stringify(authUser)),
      ]);
      return authUser;
    } catch (error) {
      setUser(null);
      setToken(null);
      throw error;
    } finally {
      setIsSigningIn(false);
    }
  }

  async function updatePassword(currentPassword: string, newPassword: string) {
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    await changePassword(token, {
      current_password: currentPassword,
      new_password: newPassword,
    });
    const refreshedUser = await getCurrentUser(token);
    setUser(refreshedUser);
    await setItem(USER_KEY, JSON.stringify(refreshedUser));
  }

  async function signOut() {
    setUser(null);
    setToken(null);
    await stopBackgroundLocationUpdates();
    await Promise.all([
      deleteItem(TOKEN_KEY),
      deleteItem(USER_KEY),
    ]);
  }

  return (
    <AuthContext.Provider value={{ user, token, isSigningIn, isRestoring, signIn, changePassword: updatePassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

async function clearStoredSession() {
  await stopBackgroundLocationUpdates();
  await Promise.all([
    deleteItem(TOKEN_KEY),
    deleteItem(USER_KEY),
  ]);
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }

  return context;
}
