import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { ApiError, toApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Field } from '../../../shared/ui/Field';
import { register } from '../api';
import { useSession } from '../session';

export const PASSWORD_HINT = 'Entre 12 y 128 caracteres. Podés usar una frase.';

export function RegisterPage() {
  const { state } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (state.status === 'authenticated') return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '');
    setSubmitting(true);
    setError(null);
    try {
      await register({ workshopName: value('workshopName'), ownerName: value('ownerName'), email: value('email') });
      setSentTo(value('email').trim());
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <main className="page narrow">
        <h1>Revisá tu email</h1>
        <Alert tone="success">
          Si el email puede registrarse, te enviamos a <strong>{sentTo}</strong> un enlace para elegir tu contraseña y terminar el registro.
          Vence en 24 horas.
        </Alert>
        <p className="muted">¿No llegó? Revisá la carpeta de spam o volvé a registrarte: los enlaces anteriores siguen sirviendo.</p>
        <p><Link to="/login">Ir a iniciar sesión</Link></p>
      </main>
    );
  }

  return (
    <main className="page narrow">
      <h1>Registrá tu taller</h1>
      <p className="muted">
        Te enviamos un enlace por email para elegir la contraseña. Vas a quedar como dueño/administrador y después podés invitar a tu equipo.
      </p>
      {error && <Alert tone="error">{error.message}</Alert>}
      <form onSubmit={onSubmit} noValidate>
        <Field label="Nombre del taller" name="workshopName" required maxLength={160} error={error?.fields.workshopName} />
        <Field label="Tu nombre" name="ownerName" autoComplete="name" required maxLength={160} error={error?.fields.ownerName} />
        <Field label="Email" name="email" type="email" autoComplete="email" required error={error?.fields.email} />
        <button type="submit" disabled={submitting}>{submitting ? 'Enviando…' : 'Registrar taller'}</button>
      </form>
      <p>¿Ya tenés cuenta? <Link to="/login">Iniciá sesión</Link></p>
    </main>
  );
}
