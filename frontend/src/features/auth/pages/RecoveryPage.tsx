import { Link, useLocation } from 'react-router';
import { Alert } from '../../../shared/ui/Alert';
import { Field } from '../../../shared/ui/Field';
import { tokenFromHash } from '../../../shared/lib/format';
import { AuthScreen } from '../AuthScreen';

export function RecoveryPage({ reset = false }: { reset?: boolean }) {
  const { hash } = useLocation();
  const missingToken = reset && !tokenFromHash(hash);

  return (
    <AuthScreen
      title={missingToken ? 'El enlace no es válido' : reset ? 'Elegí una nueva contraseña' : 'Recuperá tu contraseña'}
      description={reset ? undefined : 'Ingresá el email de tu cuenta del taller.'}
      badge="Recuperación de acceso"
    >
      <Alert tone={missingToken ? 'error' : 'info'}>
        {missingToken ? 'Abrí el enlace completo desde el correo.' : 'La recuperación de contraseña todavía no está disponible.'}
      </Alert>
      {!missingToken && (
        <form className="auth-form" onSubmit={event => event.preventDefault()}>
          {reset ? (
            <>
              <Field label="Nueva contraseña" name="password" type="password" autoComplete="new-password" disabled />
              <Field label="Repetí la contraseña" name="passwordConfirm" type="password" autoComplete="new-password" disabled />
            </>
          ) : <Field label="Email" name="email" type="email" autoComplete="email" />}
          <button type="submit" disabled>{reset ? 'Guardar contraseña' : 'Enviar enlace'}</button>
        </form>
      )}
      <Link className="button-link" to="/login">Volver al inicio de sesión</Link>
    </AuthScreen>
  );
}
