import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toApiError } from '../../../shared/api/http';
import { ROLE_LABELS } from '../../../shared/lib/format';
import { Alert } from '../../../shared/ui/Alert';
import { unlinkGoogle } from '../api';
import { useGoogleAvailability } from '../GoogleAccess';
import { useMe, useSession } from '../session';

export function ProfilePage() {
  const me = useMe();
  const { setMe } = useSession();
  const google = useGoogleAvailability();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!me) return null;

  async function onUnlink() {
    if (!me) return;
    setBusy(true);
    setError(undefined);
    try {
      await unlinkGoogle();
      setMe({ ...me, googleLinked: false });
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="account-page">
      <Link to="/">‹ Inicio</Link>
      <h1>Mi perfil</h1>
      <p className="muted">{me.workshop.name} · Sucursal única</p>
      <section className="account-page-panel" aria-label="Mi cuenta">
        <strong>{me.user.name}</strong>
        <p className="muted">{me.user.email} · {ROLE_LABELS[me.role]}</p>
        <Link className="button-link account-logout-link" to="/cerrar-sesion">Cerrar sesión</Link>
      </section>
      {(google === 'available' || me.googleLinked) && (
        <section className="account-page-panel" aria-labelledby="google-account">
          <h2 id="google-account">Cuenta de Google</h2>
          {error && <Alert tone="error">{error}</Alert>}
          {me.googleLinked ? (
            <>
              <p role="status">Google vinculado</p>
              {me.passwordConfigured ? (
                <button className="secondary" type="button" disabled={busy} onClick={() => void onUnlink()}>
                  {busy ? 'Desvinculando…' : 'Desvincular Google'}
                </button>
              ) : <Link to="/recuperar-contrasena">Crear una contraseña</Link>}
            </>
          ) : <a className="button-link" href="/api/auth/google/link/start">Vincular con Google</a>}
        </section>
      )}
    </main>
  );
}

export function ConfirmLogoutPage() {
  const me = useMe();
  const { logout } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onLogout() {
    setBusy(true);
    setError(undefined);
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (caught) {
      setError(toApiError(caught).message);
      setBusy(false);
    }
  }

  return (
    <main className="account-page">
      <Link to="/perfil">‹ Mi perfil</Link>
      <p className="account-eyebrow">Cuenta / Confirmación</p>
      <h1>Cerrar sesión</h1>
      <p className="muted">{me?.workshop.name} · {me?.user.name}</p>
      <section className="account-page-panel" aria-labelledby="logout-detail">
        <h2 id="logout-detail">Detalle</h2>
        <div className="account-logout-notice">
          <strong>Cerrar sesión</strong>
          <p>Podés iniciar sesión de nuevo con tu cuenta del taller.</p>
        </div>
        {error && <Alert tone="error">No se cerró la sesión. {error}</Alert>}
        <div className="auth-actions">
          <button type="button" disabled={busy} onClick={() => void onLogout()}>{busy ? 'Cerrando…' : 'Cerrar sesión'}</button>
          <Link className="button-link" to="/">Cancelar</Link>
        </div>
      </section>
    </main>
  );
}
