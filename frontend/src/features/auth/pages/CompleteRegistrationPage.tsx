import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ApiError, toApiError } from '../../../shared/api/http';
import { formatDateTime, tokenFromHash } from '../../../shared/lib/format';
import { Alert } from '../../../shared/ui/Alert';
import { Field } from '../../../shared/ui/Field';
import { completeRegistration, previewRegistration, RegistrationPreview } from '../api';
import { PASSWORD_HINT } from './RegisterPage';
import { AuthScreen } from '../AuthScreen';

type State =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; registration: RegistrationPreview }
  | { kind: 'done'; message: string };

/** Destino del enlace del email: quien controla el buzón elige la contraseña y crea la cuenta. */
export function CompleteRegistrationPage() {
  const { hash } = useLocation();
  const token = tokenFromHash(hash);
  const [state, setState] = useState<State>(token ? { kind: 'loading' } : { kind: 'invalid', message: 'El enlace no es válido. Abrilo de nuevo desde el email.' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    previewRegistration(token)
      .then(registration => { if (active) setState({ kind: 'ready', registration }); })
      .catch(caught => { if (active) setState({ kind: 'invalid', message: toApiError(caught).message }); });
    return () => { active = false; };
  }, [token]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password !== String(form.get('passwordConfirm') ?? '')) {
      setError(new ApiError(400, 'Revisá los datos ingresados.', 'VALIDATION_ERROR', { passwordConfirm: 'Las contraseñas no coinciden.' }));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      setState({ kind: 'done', message: (await completeRegistration(token, password)).message });
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen title={state.kind === 'invalid' ? 'Enlace de registro no disponible' : 'Completá tu registro'} badge="Acceso al taller">
      {state.kind === 'loading' && <p aria-busy="true">Revisando el enlace…</p>}
      {state.kind === 'invalid' && (
        <>
          <Alert tone="error">{state.message}</Alert>
          <p><Link to="/registro">Registrar el taller</Link></p>
        </>
      )}
      {state.kind === 'done' && (
        <>
          <Alert tone="success">{state.message}</Alert>
          <p><Link to="/login">Ir a iniciar sesión</Link></p>
        </>
      )}
      {state.kind === 'ready' && (
        <>
          <p>
            Vas a registrar <strong>{state.registration.workshopName}</strong> como <strong>{state.registration.ownerName}</strong>,
            con el email <strong>{state.registration.email}</strong>. El enlace vence el {formatDateTime(state.registration.expiresAt)}.
          </p>
          {error && (
            <Alert tone="error">
              <p>{error.message}</p>
              {error.code === 'ALREADY_REGISTERED' && <p><Link to="/login">Ir a iniciar sesión</Link></p>}
            </Alert>
          )}
          <form className="auth-form" onSubmit={onSubmit} noValidate>
            <Field label="Elegí tu contraseña" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128}
              hint={PASSWORD_HINT} error={error?.fields.password} />
            <Field label="Repetí la contraseña" name="passwordConfirm" type="password" autoComplete="new-password" required
              error={error?.fields.passwordConfirm} />
            <button type="submit" disabled={submitting}>{submitting ? 'Creando la cuenta…' : 'Crear cuenta'}</button>
          </form>
        </>
      )}
    </AuthScreen>
  );
}
