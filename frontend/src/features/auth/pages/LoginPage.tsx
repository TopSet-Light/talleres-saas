import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError, toApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Field } from '../../../shared/ui/Field';
import { login, resendVerification } from '../api';
import { useSession } from '../session';

export function LoginPage() {
  const { state, setMe } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      setMe(await login(String(form.get('email') ?? ''), String(form.get('password') ?? '')));
      navigate(from, { replace: true });
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    try {
      setNotice((await resendVerification(email)).message);
      setError(null);
    } catch (caught) {
      setError(toApiError(caught));
    }
  }

  return (
    <main className="page narrow">
      <h1>Iniciar sesión</h1>
      {error && (
        <Alert tone="error">
          <p>{error.message}</p>
          {error.code === 'EMAIL_NOT_VERIFIED' && (
            <button type="button" className="link-button" onClick={() => void onResend()}>Reenviar email de verificación</button>
          )}
        </Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      <form onSubmit={onSubmit} noValidate>
        <Field label="Email" name="email" type="email" autoComplete="email" required value={email}
          onChange={event => setEmail(event.target.value)} error={error?.fields.email} />
        <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required error={error?.fields.password} />
        <button type="submit" disabled={submitting}>{submitting ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
      <p>¿Tu taller todavía no tiene cuenta? <Link to="/registro">Registrá tu taller</Link></p>
      <p className="muted"><Link to="/estado">Estado del servicio</Link></p>
    </main>
  );
}
