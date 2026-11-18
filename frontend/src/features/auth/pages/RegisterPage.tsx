import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { ApiError, toApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Field } from '../../../shared/ui/Field';
import { register } from '../api';
import { AuthScreen } from '../AuthScreen';
import { GoogleAccess, GoogleFeedback } from '../GoogleAccess';
import { useSession } from '../session';
import { readWorkshopDetails, WorkshopContactFields } from '../WorkshopContactFields';

export const PASSWORD_HINT = 'Entre 12 y 128 caracteres. Podés usar una frase.';

export function RegisterPage() {
  const { state } = useSession();
  const { search } = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [sent, setSent] = useState<Parameters<typeof register>[0] | null>(null);
  const [resent, setResent] = useState(false);

  if (state.status === 'authenticated') return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '');
    await send({
      ...readWorkshopDetails(form), ownerName: value('ownerName'), email: value('email').trim(),
    });
  }

  async function send(details: Parameters<typeof register>[0]) {
    setSubmitting(true);
    setError(null);
    setResent(false);
    try {
      await register(details);
      setResent(sent !== null);
      setSent(details);
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthScreen variant="notice" tone="success" title="Revisá tu correo" badge="Registro de taller">
        <Alert tone="success">
          Si el email puede registrarse, te enviamos a <strong>{sent.email}</strong> un enlace para elegir tu contraseña y terminar el registro.
          Vence en 24 horas.
        </Alert>
        <p className="muted">¿No llegó? Revisá la carpeta de spam o pedí otro enlace.</p>
        {error && <Alert tone="error">{error.message}</Alert>}
        {resent && <p role="status">Si el email puede registrarse, solicitamos otro enlace para esa dirección.</p>}
        <div className="auth-actions">
          <button type="button" className="secondary" disabled={submitting} onClick={() => void send(sent)}>
            {submitting ? 'Enviando…' : 'Reenviar email'}
          </button>
          <Link className="button-link" to="/login">Ir a iniciar sesión</Link>
        </div>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen variant="card" title="Registrá tu taller" badge="Acceso al taller"
      description="Creá el espacio de trabajo de tu equipo. Te enviamos un enlace por email para elegir tu contraseña.">
      <GoogleFeedback search={search} />
      {error && <Alert tone="error">{error.message}</Alert>}
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="auth-field-pair">
          <Field label="Nombre comercial" name="workshopName" autoComplete="organization" required maxLength={160} error={error?.fields.workshopName} />
          <Field label="Nombre del responsable" name="ownerName" autoComplete="name" required maxLength={160} error={error?.fields.ownerName} />
        </div>
        <Field label="Email" name="email" type="email" autoComplete="email" required error={error?.fields.email} />
        <WorkshopContactFields errors={error?.fields} />
        <button type="submit" disabled={submitting}>{submitting ? 'Enviando…' : 'Crear taller'}</button>
        <GoogleAccess register />
      </form>
      <Link className="button-link" to="/login">Volver al inicio de sesión</Link>
    </AuthScreen>
  );
}
