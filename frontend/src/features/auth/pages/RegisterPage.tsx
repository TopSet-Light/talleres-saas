import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { ApiError, toApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Field } from '../../../shared/ui/Field';
import { register } from '../api';
import { AuthScreen } from '../AuthScreen';
import googleIcon from '../assets/google.svg';
import { useSession } from '../session';

export const PASSWORD_HINT = 'Entre 12 y 128 caracteres. Podés usar una frase.';

export function RegisterPage() {
  const { state } = useSession();
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
      workshopName: value('workshopName'), ownerName: value('ownerName'), email: value('email').trim(),
      contactPhone: value('contactPhone'), locality: value('locality'), address: value('address'),
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
      <AuthScreen title="Revisá tu correo" badge="Registro de taller">
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
    <AuthScreen title="Registrá tu taller" badge="Acceso al taller"
      description="Creá el espacio de trabajo de tu equipo. Te enviamos un enlace por email para elegir tu contraseña.">
      {error && <Alert tone="error">{error.message}</Alert>}
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <h2 className="form-section-title">Datos del taller</h2>
        <div className="auth-field-pair">
          <Field label="Nombre del taller" name="workshopName" autoComplete="organization" required maxLength={160} error={error?.fields.workshopName} />
          <Field label="Tu nombre" name="ownerName" autoComplete="name" required maxLength={160} error={error?.fields.ownerName} />
        </div>
        <Field label="Teléfono de contacto" name="contactPhone" type="tel" autoComplete="tel" required maxLength={40} error={error?.fields.contactPhone} />
        <div className="auth-field-pair">
          <Field label="Ciudad o localidad" name="locality" autoComplete="address-level2" required maxLength={120} error={error?.fields.locality} />
          <Field label="Dirección" name="address" autoComplete="street-address" required maxLength={300} error={error?.fields.address} />
        </div>
        <Field label="Email" name="email" type="email" autoComplete="email" required error={error?.fields.email} />
        <button type="submit" disabled={submitting}>{submitting ? 'Enviando…' : 'Registrar taller'}</button>
        <div className="auth-divider" aria-hidden="true">o</div>
        <button type="button" className="secondary google-button" disabled aria-describedby="google-registration-availability">
          <img src={googleIcon} width={18} height={18} alt="" /> Continuar con Google
        </button>
        <p className="field-hint" id="google-registration-availability">El registro con Google todavía no está disponible.</p>
      </form>
      <Link className="button-link" to="/login">Volver al inicio de sesión</Link>
    </AuthScreen>
  );
}
