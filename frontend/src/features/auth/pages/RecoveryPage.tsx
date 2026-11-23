import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { ApiError, toApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Field } from '../../../shared/ui/Field';
import { tokenFromHash } from '../../../shared/lib/format';
import { AuthScreen } from '../AuthScreen';
import { forgotPassword, previewPasswordReset, resetPassword } from '../api';
import { PASSWORD_HINT } from './RegisterPage';
import { useSession } from '../session';

type Preview =
  | { kind: 'loading' }
  | { kind: 'ready'; email: string }
  | { kind: 'error'; error: ApiError };

export function RecoveryPage({ reset = false }: { reset?: boolean }) {
  const { hash } = useLocation();
  const token = tokenFromHash(hash) ?? '';
  return reset ? <ResetForm key={token} token={token} /> : <RecoveryForm />;
}

function RecoveryForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const [message, setMessage] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    setBusy(true);
    setError(undefined);
    try {
      setMessage((await forgotPassword(email)).message);
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen variant={message ? 'notice' : 'access'} tone={message ? 'success' : 'info'} title={message ? 'Revisá tu correo' : 'Recuperar contraseña'}
      description={message ? 'Revisá también la carpeta de spam. El enlace vence en una hora.' : 'Solicitá un enlace para volver a ingresar.'}
      badge="Acceso al taller">
      {error && <Alert tone="error">{error.message}</Alert>}
      {message ? (
        <>
          <Alert tone="success">{message}</Alert>
          <button className="secondary" type="button" onClick={() => setMessage(undefined)}>Solicitar otro enlace</button>
        </>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <h2 className="form-section-title">Cuenta</h2>
          <Field label="Email" name="email" type="email" autoComplete="email" required error={error?.fields.email} />
          <button disabled={busy}>{busy ? 'Enviando…' : 'Enviar enlace'}</button>
        </form>
      )}
      <Link className={`button-link${message ? ' primary' : ''}`} to="/login">
        {message ? 'Volver a iniciar sesión' : 'Volver al inicio de sesión'}
      </Link>
    </AuthScreen>
  );
}

function ResetForm({ token }: { token: string }) {
  const { reload } = useSession();
  const [preview, setPreview] = useState<Preview>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (!token) return;
    let active = true;
    previewPasswordReset(token)
      .then(value => { if (active) setPreview({ kind: 'ready', email: value.email }); })
      .catch(caught => { if (active) setPreview({ kind: 'error', error: toApiError(caught) }); });
    return () => { active = false; };
  }, [token, attempt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password !== form.get('passwordConfirm')) {
      setError(new ApiError(400, 'Revisá los datos ingresados.', 'VALIDATION_ERROR', { passwordConfirm: 'Las contraseñas no coinciden.' }));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      setMessage((await resetPassword(token, password)).message);
      await reload();
    } catch (caught) {
      const failure = toApiError(caught);
      if (failure.code === 'INVALID_TOKEN') setPreview({ kind: 'error', error: failure });
      else setError(failure);
    } finally {
      setBusy(false);
    }
  }

  const invalid = !token || (preview.kind === 'error' && preview.error.code === 'INVALID_TOKEN');
  return (
    <AuthScreen title={message ? 'Contraseña actualizada' : invalid ? 'El enlace no es válido' : 'Elegí una nueva contraseña'} badge="Recuperación de acceso">
      {message ? <Alert tone="success">{message}</Alert> : invalid ? (
        <>
          <Alert tone="error">El enlace no es válido, ya se usó o venció.</Alert>
          <Link className="button-link" to="/recuperar-contrasena">Solicitar otro enlace</Link>
        </>
      ) : preview.kind === 'loading' ? <p role="status">Revisando el enlace…</p>
        : preview.kind === 'error' ? (
          <>
            <Alert tone="error">{preview.error.message}</Alert>
            <button type="button" onClick={() => { setPreview({ kind: 'loading' }); setAttempt(value => value + 1); }}>Reintentar</button>
          </>
        ) : (
          <>
            <p>Cuenta de {preview.email}</p>
            {error && <Alert tone="error">{error.message}</Alert>}
            <form className="auth-form" onSubmit={submit} noValidate>
              <Field label="Nueva contraseña" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} hint={PASSWORD_HINT} error={error?.fields.password} />
              <Field label="Repetí la contraseña" name="passwordConfirm" type="password" autoComplete="new-password" required error={error?.fields.passwordConfirm} />
              <button disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
            </form>
          </>
        )}
      <Link className="button-link" to="/login">Volver al inicio de sesión</Link>
    </AuthScreen>
  );
}
