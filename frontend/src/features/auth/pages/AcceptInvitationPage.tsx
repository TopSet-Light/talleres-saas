import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ApiError, toApiError } from '../../../shared/api/http';
import { formatDateTime, ROLE_LABELS, tokenFromHash } from '../../../shared/lib/format';
import { Alert } from '../../../shared/ui/Alert';
import { Field } from '../../../shared/ui/Field';
import { acceptInvitation, InvitationPreview, previewInvitation } from '../api';
import { PASSWORD_HINT } from './RegisterPage';
import { AuthScreen } from '../AuthScreen';

type State =
  | { kind: 'loading' }
  | { kind: 'invalid'; error: ApiError }
  | { kind: 'ready'; invitation: InvitationPreview }
  | { kind: 'accepted'; message: string };

export function AcceptInvitationPage() {
  const { hash } = useLocation();
  const token = tokenFromHash(hash);
  return <InvitationForm key={token ?? ''} token={token} />;
}

function InvitationForm({ token }: { token: ReturnType<typeof tokenFromHash> }) {
  const [state, setState] = useState<State>(token ? { kind: 'loading' } : {
    kind: 'invalid', error: new ApiError(400, 'El enlace no es válido. Abrilo de nuevo desde el email.', 'INVALID_TOKEN'),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    let active = true;
    previewInvitation(token)
      .then(invitation => { if (active) setState({ kind: 'ready', invitation }); })
      .catch(caught => { if (active) setState({ kind: 'invalid', error: toApiError(caught) }); });
    return () => { active = false; };
  }, [token, attempt]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '');
    if (value('password') !== value('passwordConfirm')) {
      setError(new ApiError(400, 'Revisá los datos ingresados.', 'VALIDATION_ERROR', { passwordConfirm: 'Las contraseñas no coinciden.' }));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      setState({ kind: 'accepted', message: (await acceptInvitation({ token, name: value('name'), password: value('password') })).message });
    } catch (caught) {
      const failure = toApiError(caught);
      if (['INVALID_TOKEN', 'INVITATION_EXPIRED', 'INVITATION_USED'].includes(failure.code ?? '')) {
        setState({ kind: 'invalid', error: failure });
      } else {
        setError(failure);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (state.kind === 'invalid') {
    const expired = state.error.code === 'INVITATION_EXPIRED';
    const used = state.error.code === 'INVITATION_USED';
    const title = expired ? 'Invitación vencida' : used ? 'Invitación ya utilizada' : 'Invitación no disponible';
    return (
      <AuthScreen variant="notice" tone="warning" title={title} description={state.error.message} badge="Acceso al taller">
        {token && (state.error.status === 0 || state.error.status >= 500 || state.error.status === 429) && (
          <button type="button" onClick={() => { setState({ kind: 'loading' }); setAttempt(attempt + 1); }}>Reintentar</button>
        )}
        <Link className="button-link primary" to="/login">{used ? 'Iniciar sesión' : 'Volver al inicio'}</Link>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen variant="card" title="Aceptá tu invitación" badge="Acceso al taller">
      {state.kind === 'loading' && <p aria-busy="true">Revisando la invitación…</p>}
      {state.kind === 'accepted' && (
        <>
          <Alert tone="success">{state.message}</Alert>
          <p><Link to="/login">Ir a iniciar sesión</Link></p>
        </>
      )}
      {state.kind === 'ready' && (
        <>
          <p>
            Te invitaron a <strong>{state.invitation.workshopName}</strong> con el rol <strong>{ROLE_LABELS[state.invitation.role]}</strong>.
            {' '}La invitación vence el {formatDateTime(state.invitation.expiresAt)}.
          </p>
          {error && <Alert tone="error">{error.message}</Alert>}
          <form className="auth-form" onSubmit={onSubmit} noValidate>
            <Field label="Email" name="email" type="email" value={state.invitation.email} readOnly />
            <Field label="Tu nombre" name="name" autoComplete="name" required maxLength={160} error={error?.fields.name} />
            <Field label="Contraseña" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128}
              hint={PASSWORD_HINT} error={error?.fields.password} />
            <Field label="Repetí la contraseña" name="passwordConfirm" type="password" autoComplete="new-password" required
              error={error?.fields.passwordConfirm} />
            <button type="submit" disabled={submitting}>{submitting ? 'Aceptando…' : 'Aceptar invitación'}</button>
          </form>
        </>
      )}
    </AuthScreen>
  );
}
