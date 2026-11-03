import { useEffect, useState } from 'react';

type Health = { status: string; database: string };
type State = { kind: 'loading' | 'ok' | 'error'; response?: Health };

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    let active = true;
    async function check() {
      try {
        const response = await fetch('/api/health', { signal: controller.signal });
        const body: unknown = await response.json();
        const health = typeof body === 'object' && body !== null &&
          'status' in body && typeof body.status === 'string' &&
          'database' in body && typeof body.database === 'string'
          ? { status: body.status, database: body.database } : undefined;
        if (active) setState({
          kind: response.ok && health?.status === 'ok' && health.database === 'ok' ? 'ok' : 'error',
          response: health,
        });
      } catch {
        if (active) setState({ kind: 'error' });
      } finally { clearTimeout(timeout); }
    }
    void check();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, []);

  return <main>
    <p className="eyebrow">ENTORNO LOCAL · PRIMERA ENTREGA</p>
    <h1>Gestión de talleres</h1>
    <p>Estado de conexión entre la aplicación, la API y PostgreSQL.</p>
    <section className={state.kind} aria-live="polite" aria-busy={state.kind === 'loading'}>
      <h2>{state.kind === 'loading' ? 'Consultando…' : state.kind === 'ok' ? 'Conexión correcta' : 'Servicio no disponible'}</h2>
      {state.response && <pre>{JSON.stringify(state.response, null, 2)}</pre>}
      {state.kind === 'error' && <p>No se pudo confirmar la conexión. Recargá la página para volver a consultar.</p>}
    </section>
  </main>;
}
