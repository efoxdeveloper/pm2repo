import PropTypes from 'prop-types';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentUser, login as loginRequest, logout as logoutRequest } from 'api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const payload = await getCurrentUser();
      setUser(payload.user || null);
      return payload.user || null;
    } catch (error) {
      if (error.status === 401) {
        setUser(null);
        return null;
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser().catch(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (credentials) => {
    const payload = await loginRequest(credentials);
    setUser(payload.user);
    return payload.user;
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
  }, []);

  const hasPermission = useCallback((permission) => Boolean(user?.permissions?.some((item) => item === '*' || item === permission)), [user]);
  const value = useMemo(() => ({ user, loading, login, logout, refreshUser, hasPermission }), [hasPermission, loading, login, logout, refreshUser, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

AuthProvider.propTypes = { children: PropTypes.node };
