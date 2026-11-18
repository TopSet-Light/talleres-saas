import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { ApiError, toApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Field } from '../../../shared/ui/Field';
import { checkGoogleRegistration, completeGoogleRegistration } from '../api';
import { AuthScreen } from '../AuthScreen';
import { useSession } from '../session';
import { readWorkshopDetails, WorkshopContactFields } from '../WorkshopContactFields';

export function GoogleRegistrationPage() {
  const { state, setMe } = useSession();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [check, setCheck] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let active = true;
    checkGoogleRegistration().then(() => { if (active) setReady(true); })
      .catch(caught => { if (active) setError(toApiError(caught)); });
    return () => { active = false; };
  }, [check]);

  if (state.status === 'authenticated') return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const details = readWorkshopDetails(new FormData(event.currentTarget));
    setSubmitting(true);
    setError(null);
    try {
      setMe(await completeGoogleRegistration(details));
      navigate('/', { replace: true });
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  const expired = error?.code === 'INVALID_GOOGLE_REGISTRATION';
  const registered = error?.code === 'ALREADY_REGISTERED';
  return (
    <AuthScreen variant="card" title="Completá los datos de tu taller" badge="Cuenta de Google"
      description="Ingresá los datos del taller para crear tu espacio de trabajo.">
      {error && <Alert tone="error">{error.message}</Alert>}
      {expired && <Link className="button-link" to="/registro">Volver al registro</Link>}
      {registered && <Link className="button-link" to="/login">Iniciar sesión</Link>}
      {ready && !expired && !registered && (
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <Field label="Nombre comercial" name="workshopName" autoComplete="organization" required maxLength={160}
            placeholder="Ej. Taller Horizonte" error={error?.fields.workshopName} />
          <WorkshopContactFields errors={error?.fields} />
          <button type="submit" disabled={submitting}>{submitting ? 'Creando taller…' : 'Crear taller'}</button>
        </form>
      )}
      {!ready && !error && <p aria-busy="true">Validando el registro…</p>}
      {!ready && error && !expired && !registered && (
        <button type="button" onClick={() => { setError(null); setCheck(check + 1); }}>Reintentar</button>
      )}
    </AuthScreen>
  );
}
