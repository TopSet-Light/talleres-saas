import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError, toApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Field } from '../../../shared/ui/Field';
import { login } from '../api';
import { AuthScreen } from '../AuthScreen';
import { GoogleAccess, GoogleFeedback } from '../GoogleAccess';
import { useSession } from '../session';

export function LoginPage() {
  const { state, setMe } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  if (error?.code === 'ACCESS_DISABLED' || new URLSearchParams(location.search).get('google') === 'disabled') {
    return (
      <AuthScreen variant="notice" tone="danger" title="Cuenta desactivada" badge="Acceso al taller"
        description="Consultá con la persona administradora de tu taller.">
        <Link className="button-link primary" to="/login" replace onClick={() => setError(null)}>Volver al inicio</Link>
      </AuthScreen>
    );
  }
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      setMe(await login(String(form.get('email') ?? ''), String(form.get('password') ?? '')));
      navigate(from, { replace: true });
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen title="Ingresá a tu taller" description="Accedé con tu email o con Google."
      badge="Acceso seguro">
      <GoogleFeedback search={location.search} />
      {error && <Alert tone="error">{error.message}</Alert>}
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <h2 className="form-section-title">Inicio de sesión</h2>
        <Field label="Email" name="email" type="email" autoComplete="email" required error={error?.fields.email} />
        <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required error={error?.fields.password} />
        <button type="submit" disabled={submitting}>{submitting ? 'Ingresando…' : 'Iniciar sesión'}</button>
        <GoogleAccess />
      </form>
      <Link className="button-link" to="/recuperar-contrasena">Olvidé mi contraseña</Link>
      <div className="auth-actions">¿No tienes cuenta? <Link className="button-link" to="/registro">Registrar taller</Link></div>
    </AuthScreen>
  );
}
