'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Me = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  level: number;
  xp: number;
  avatarSeed: string;
  balance: number;
  tier?: string;
  tierColor?: string;
  intoLevel?: number;
  needed?: number;
  notifications?: number;
};

type Ctx = {
  me: Me | null;
  loading: boolean;
  setBalance: (value: number) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<Ctx>({
  me: null,
  loading: false,
  setBalance: () => {},
  refresh: async () => {},
  logout: async () => {},
});

export function SessionProvider({ initial, children }: { initial: Me | null; children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(initial);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/me', { cache: 'no-store' });
      const data = await response.json();
      setMe(data.user);
    } finally {
      setLoading(false);
    }
  }, []);

  // Le solde affiché suit les manches jouées sans recharger la page
  const setBalance = useCallback((value: number) => {
    setMe((current) => (current ? { ...current, balance: value } : current));
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setMe(null);
    window.location.href = '/login';
  }, []);

  // Récupère les infos complètes (niveau, notifications) après le premier rendu
  useEffect(() => {
    if (initial) void refresh();
  }, [initial, refresh]);

  const value = useMemo(() => ({ me, loading, setBalance, refresh, logout }), [me, loading, setBalance, refresh, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
