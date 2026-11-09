import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ApiError, toApiError } from '../../../shared/api/http';
import { formatDateTime, ROLE_LABELS, tokenFromHash } from '../../../shared/lib/format';
import { Alert } from '../../../shared/ui/Alert';
import { Field } from '../../../shared/ui/Field';
import { acceptInvitation, InvitationPreview, previewInvitation } from '../api';
import { PASSWORD_HINT } from './RegisterPage';

type State =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; invitation: InvitationPreview }
  | { kind: 'accepted'; message: string };

export function AcceptInvitationPage() {
  const { hash } = useLocation();
  const token = tokenFromHash(hash);
  const [state, setState] = useState<State>(token ? { kind: 'loading' } : { kind: 'invalid', message: 'El enlace no es válido. Abrilo de nuevo desde el email.' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    previewInvitation(token)
      .then(invitation => { if (active) setState({ kind: 'ready', invitation }); })
      .catch(caught => { if (active) setState({ kind: 'invalid', message: toApiError(caught).message }); });
    return () => { active = false; };
  }, [token]);

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
      setError(toApiError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page narrow">
      <h1>Invitación al taller</h1>
      {state.kind === 'loading' && <p aria-busy="true">Revisando la invitación…</p>}
      {state.kind === 'invalid' && <Alert tone="error">{state.message}</Alert>}
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
            Tu usuario será <strong>{state.invitation.email}</strong>. La invitación vence el {formatDateTime(state.invitation.expiresAt)}.
          </p>
          {error && <Alert tone="error">{error.message}</Alert>}
          <form onSubmit={onSubmit} noValidate>
            <Field label="Tu nombre" name="name" autoComplete="name" required maxLength={160} error={error?.fields.name} />
            <Field label="Contraseña" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128}
              hint={PASSWORD_HINT} error={error?.fields.password} />
            <Field label="Repetí la contraseña" name="passwordConfirm" type="password" autoComplete="new-password" required
              error={error?.fields.passwordConfirm} />
            <button type="submit" disabled={submitting}>{submitting ? 'Aceptando…' : 'Aceptar invitación'}</button>
          </form>
        </>
      )}
    </main>
  );
}
