import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { toApiError } from '../../../shared/api/http';
import { tokenFromHash } from '../../../shared/lib/format';
import { Alert } from '../../../shared/ui/Alert';
import { verifyEmail } from '../api';

type State = { kind: 'loading' } | { kind: 'ok'; message: string } | { kind: 'error'; message: string };

export function VerifyEmailPage() {
  const { hash } = useLocation();
  const token = tokenFromHash(hash);
  const [state, setState] = useState<State>(token ? { kind: 'loading' } : { kind: 'error', message: 'El enlace no es válido. Abrilo de nuevo desde el email.' });

  useEffect(() => {
    if (!token) return;
    let active = true;
    verifyEmail(token)
      .then(result => { if (active) setState({ kind: 'ok', message: result.message }); })
      .catch(error => { if (active) setState({ kind: 'error', message: toApiError(error).message }); });
    return () => { active = false; };
  }, [token]);

  return (
    <main className="page narrow">
      <h1>Verificación de email</h1>
      {state.kind === 'loading' && <p aria-busy="true">Verificando…</p>}
      {state.kind === 'ok' && <Alert tone="success">{state.message}</Alert>}
      {state.kind === 'error' && (
        <Alert tone="error">
          <p>{state.message}</p>
          <p>Desde «Iniciar sesión» podés pedir un enlace nuevo.</p>
        </Alert>
      )}
      {state.kind !== 'loading' && <p><Link to="/login">Ir a iniciar sesión</Link></p>}
    </main>
  );
}
