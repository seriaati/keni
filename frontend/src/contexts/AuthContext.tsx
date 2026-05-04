import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { auth, users } from '../lib/api';
import type { UserResponse } from '../lib/types';
import i18n from '../lib/i18n';

interface AuthContextValue {
  user: UserResponse | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const me = await users.me();
      setUser(me);
      if (me.language) await i18n.changeLanguage(me.language);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const token = auth.getToken();
    if (token) {
      refreshUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [refreshUser]);

  const login = async (username: string, password: string) => {
    const tokens = await auth.login(username, password);
    auth.setTokens(tokens);
    await refreshUser();
  };

  const signup = async (username: string, password: string, displayName?: string) => {
    const tokens = await auth.signup(username, password, displayName);
    auth.setTokens(tokens);
    await refreshUser();
  };

  const logout = () => {
    auth.clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
