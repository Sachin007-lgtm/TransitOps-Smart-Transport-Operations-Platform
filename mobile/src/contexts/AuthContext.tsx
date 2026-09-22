import * as SecureStore from 'expo-secure-store';
import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';

import { ApiError } from '@/utils/api';
import { AuthUser, getCurrentUser, login } from '@/features/auth/authApi';

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isSigningIn: boolean;
  isRestoring: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const TOKEN_KEY = 'transitops.auth.token';
const USER_KEY = 'transitops.auth.user';

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      try {
        const [storedToken, storedUser] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
        ]);

        if (storedToken && storedUser) {
          const cachedUser = JSON.parse(storedUser) as AuthUser;

          try {
            const currentUser = await getCurrentUser(storedToken);
            setToken(storedToken);
            setUser(currentUser);
            await SecureStore.setItemAsync(USER_KEY, JSON.stringify(currentUser));
          } catch (error) {
            if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
              await clearStoredSession();
            } else {
              setToken(storedToken);
              setUser(cachedUser);
            }
          }
        }
      } catch {
        await Promise.all([
          SecureStore.deleteItemAsync(TOKEN_KEY),
          SecureStore.deleteItemAsync(USER_KEY),
        ]);
      } finally {
        setIsRestoring(false);
      }
    }

    void restoreSession();
  }, []);

  async function signIn(email: string, password: string) {
    setIsSigningIn(true);

    try {
      const response = await login(email, password);
      setUser(response.data.user);
      setToken(response.data.token);
      await Promise.all([
        SecureStore.setItemAsync(TOKEN_KEY, response.data.token),
        SecureStore.setItemAsync(USER_KEY, JSON.stringify(response.data.user)),
      ]);
    } catch (error) {
      setUser(null);
      setToken(null);
      throw error;
    } finally {
      setIsSigningIn(false);
    }
  }

  async function signOut() {
    setUser(null);
    setToken(null);
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
  }

  return (
    <AuthContext.Provider value={{ user, token, isSigningIn, isRestoring, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

async function clearStoredSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ]);
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }

  return context;
}
