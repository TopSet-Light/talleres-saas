import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, setUnauthorizedHandler } from '../../shared/api/http';
import { getMe, logout as logoutRequest, Me } from './api';

type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; me: Me }
  | { status: 'error'; message: string };

type Session = {
  state: SessionState;
  setMe: (me: Me) => void;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

/** Conoce al usuario solo a través de /api/auth/me: la cookie no es legible desde JavaScript. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'authenticated', me: await getMe() });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setState({ status: 'anonymous' });
      else setState({ status: 'error', message: error instanceof ApiError ? error.message : 'No pudimos cargar tu sesión.' });
    }
  }, []);

  useEffect(() => {
    // Si la API rechaza la sesión (venció o hubo una baja), se vuelve al login.
    setUnauthorizedHandler(() => setState({ status: 'anonymous' }));
    void reload();
    return () => setUnauthorizedHandler(undefined);
  }, [reload]);

  const value = useMemo<Session>(() => ({
    state,
    reload,
    setMe: me => setState({ status: 'authenticated', me }),
    logout: async () => {
      try { await logoutRequest(); } finally { setState({ status: 'anonymous' }); }
    },
  }), [state, reload]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession requiere SessionProvider');
  return session;
}

export function useMe() {
  const { state } = useSession();
  return state.status === 'authenticated' ? state.me : null;
}
