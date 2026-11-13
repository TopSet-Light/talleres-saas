import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, currentSessionVersion, nextSessionVersion, setUnauthorizedHandler } from '../../shared/api/http';
import { getMe, logout as logoutRequest, Me } from './api';

type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous'; expired?: boolean }
  | { status: 'authenticated'; me: Me }
  | { status: 'error'; message: string };

type Session = {
  state: SessionState;
  setMe: (me: Me) => void;
  reload: () => Promise<void>;
  /** Rechaza si el servidor no confirmó el cierre: la sesión sigue abierta. */
  logout: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

/** Conoce al usuario solo a través de /api/auth/me: la cookie no es legible desde JavaScript. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  // Cada cambio de sesión incrementa la versión. Una respuesta iniciada antes (por ejemplo,
  // un 401 del /auth/me inicial que llega después de un login exitoso) se descarta.
  const apply = useCallback((next: SessionState) => {
    nextSessionVersion();
    setState(next);
  }, []);

  const reload = useCallback(async () => {
    const requested = nextSessionVersion();
    setState({ status: 'loading' });
    let next: SessionState;
    try {
      next = { status: 'authenticated', me: await getMe() };
    } catch (error) {
      next = error instanceof ApiError && error.status === 401
        ? { status: 'anonymous' }
        : { status: 'error', message: error instanceof ApiError ? error.message : 'No pudimos cargar tu sesión.' };
    }
    if (requested === currentSessionVersion()) setState(next);
  }, []);

  useEffect(() => {
    // Si la API rechaza la sesión vigente (venció o hubo una baja), se vuelve al login.
    setUnauthorizedHandler(startedIn => {
      if (startedIn === currentSessionVersion()) {
        nextSessionVersion();
        setState(previous => ({ status: 'anonymous', expired: previous.status === 'authenticated' }));
      }
    });
    void reload();
    return () => setUnauthorizedHandler(undefined);
  }, [reload, apply]);

  const value = useMemo<Session>(() => ({
    state,
    reload,
    setMe: me => apply({ status: 'authenticated', me }),
    logout: async () => {
      await logoutRequest();
      apply({ status: 'anonymous' });
    },
  }), [state, reload, apply]);

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
