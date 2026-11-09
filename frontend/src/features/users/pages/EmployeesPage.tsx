import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ApiError, toApiError } from '../../../shared/api/http';
import { formatDateTime, Role, ROLE_LABELS, ROLES } from '../../../shared/lib/format';
import { Alert } from '../../../shared/ui/Alert';
import { Field } from '../../../shared/ui/Field';
import { createInvitation, Employee, Invitation, listEmployees, listInvitations, revokeInvitation, updateEmployee } from '../api';

type Data = { employees: Employee[]; invitations: Invitation[] };
type Feedback = { tone: 'success' | 'error' | 'info'; message: string } | null;

export function EmployeesPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [employees, invitations] = await Promise.all([listEmployees(), listInvitations()]);
      setData({ employees, invitations });
    } catch (error) {
      setLoadError(toApiError(error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key);
    setFeedback(null);
    try {
      setFeedback({ tone: 'success', message: await action() });
      await load();
    } catch (error) {
      setFeedback({ tone: 'error', message: toApiError(error).message });
    } finally {
      setBusy(null);
    }
  }

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = String(form.get('email') ?? '');
    setInviteError(null);
    setBusy('invite');
    setFeedback(null);
    try {
      const invitation = await createInvitation(email, String(form.get('role')) as Role);
      formElement.reset();
      setFeedback(invitation.emailSent
        ? { tone: 'success', message: `Invitación enviada a ${invitation.email}. Vence el ${formatDateTime(invitation.expiresAt)}.` }
        : { tone: 'info', message: `La invitación a ${invitation.email} quedó creada, pero no pudimos enviar el email. Revocala y volvé a invitar más tarde.` });
      await load();
    } catch (error) {
      setInviteError(toApiError(error));
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <main className="page">
        <h1>Empleados</h1>
        <Alert tone="error">{loadError}</Alert>
        <button type="button" onClick={() => void load()}>Reintentar</button>
      </main>
    );
  }
  if (!data) return <main className="page"><h1>Empleados</h1><p aria-busy="true">Cargando empleados…</p></main>;

  return (
    <main className="page">
      <h1>Empleados</h1>
      {feedback && <Alert tone={feedback.tone}>{feedback.message}</Alert>}

      <section aria-labelledby="equipo">
        <h2 id="equipo">Equipo del taller</h2>
        <ul className="list">
          {data.employees.map(employee => (
            <li key={employee.id} className={employee.status === 'INACTIVE' ? 'row inactive' : 'row'}>
              <div className="row-main">
                <strong>{employee.name}{employee.isCurrentUser && ' (vos)'}</strong>
                <span className="muted">{employee.email}</span>
                {employee.status === 'INACTIVE' && <span className="badge">Acceso desactivado</span>}
              </div>
              {employee.isCurrentUser ? (
                <span className="muted">{ROLE_LABELS[employee.role]}</span>
              ) : (
                <div className="row-actions">
                  <label className="visually-hidden" htmlFor={`rol-${employee.id}`}>Rol de {employee.name}</label>
                  <select id={`rol-${employee.id}`} value={employee.role} disabled={busy !== null}
                    onChange={event => {
                      const role = event.target.value as Role;
                      void run(employee.id, async () => {
                        await updateEmployee(employee.id, { role });
                        return `${employee.name} ahora tiene el rol ${ROLE_LABELS[role]}.`;
                      });
                    }}>
                    {ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                  <button type="button" className={employee.status === 'ACTIVE' ? 'danger' : 'secondary'} disabled={busy !== null}
                    onClick={() => void run(employee.id, async () => {
                      const status = employee.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
                      await updateEmployee(employee.id, { status });
                      return status === 'INACTIVE' ? `Desactivaste el acceso de ${employee.name}.` : `Reactivaste el acceso de ${employee.name}.`;
                    })}>
                    {busy === employee.id ? 'Guardando…' : employee.status === 'ACTIVE' ? 'Desactivar acceso' : 'Reactivar acceso'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="invitar">
        <h2 id="invitar">Invitar a una persona</h2>
        {inviteError && <Alert tone="error">{inviteError.message}</Alert>}
        <form onSubmit={onInvite} noValidate className="inline-form">
          <Field label="Email" name="email" type="email" autoComplete="off" required error={inviteError?.fields.email} />
          <div className="field">
            <label htmlFor="rol-invitacion">Rol</label>
            <select id="rol-invitacion" name="role" defaultValue="MECHANIC">
              {ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </select>
          </div>
          <button type="submit" disabled={busy !== null}>{busy === 'invite' ? 'Enviando…' : 'Enviar invitación'}</button>
        </form>
      </section>

      <section aria-labelledby="pendientes">
        <h2 id="pendientes">Invitaciones pendientes</h2>
        {data.invitations.length === 0 ? (
          <p className="muted">No hay invitaciones pendientes.</p>
        ) : (
          <ul className="list">
            {data.invitations.map(invitation => (
              <li key={invitation.id} className="row">
                <div className="row-main">
                  <strong>{invitation.email}</strong>
                  <span className="muted">{ROLE_LABELS[invitation.role]} · vence el {formatDateTime(invitation.expiresAt)}</span>
                </div>
                <button type="button" className="secondary" disabled={busy !== null}
                  onClick={() => void run(invitation.id, async () => {
                    await revokeInvitation(invitation.id);
                    return `Revocaste la invitación a ${invitation.email}.`;
                  })}>
                  {busy === invitation.id ? 'Revocando…' : 'Revocar'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
