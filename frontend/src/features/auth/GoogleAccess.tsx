import { useEffect, useState } from 'react';
import { Alert } from '../../shared/ui/Alert';
import { getAuthOptions } from './api';
import googleIcon from './assets/google.svg';

export function useGoogleAvailability() {
  const [availability, setAvailability] = useState<'loading' | 'available' | 'disabled' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    getAuthOptions().then(options => {
      if (active) setAvailability(options.google ? 'available' : 'disabled');
    }).catch(() => { if (active) setAvailability('error'); });
    return () => { active = false; };
  }, []);
  return availability;
}

export function GoogleAccess({ register = false }: { register?: boolean }) {
  return (
    <>
      <div className="auth-divider" aria-hidden="true">o</div>
      <a className="button-link google-button" href={register ? '/api/auth/google/register/start' : '/api/auth/google/start'}>
        <img src={googleIcon} width={18} height={18} alt="" /> Continuar con Google
      </a>
    </>
  );
}

const messages: Record<string, string> = {
  invalid: 'El intento con Google venció o ya se usó. Volvé a intentarlo.',
  cancelled: 'Se canceló el acceso con Google.',
  unverified: 'Verificá tu email en Google antes de continuar.',
  'not-linked': 'Si ya tenés una cuenta del taller, ingresá con tu email y contraseña y vinculá Google desde Mi perfil. Si vas a crear un taller, elegí Registrar taller.',
  'already-registered': 'Ese email ya tiene una cuenta. Iniciá sesión con tu método habitual.',
  'email-needs-verification': 'Para usar una cuenta de Google con un correo externo, empezá con el registro por email. Después podés vincular Google desde Mi perfil.',
  disabled: 'Consultá con la persona administradora de tu taller.',
  unavailable: 'El acceso con Google todavía no está configurado para este entorno. Podés continuar con tu email.',
  conflict: 'La cuenta de Google o tu usuario ya tienen otro vínculo.',
  error: 'No pudimos completar el acceso con Google. Volvé a intentar.',
};

export function GoogleFeedback({ search }: { search: string }) {
  const result = new URLSearchParams(search).get('google');
  if (result === 'linked') return <Alert tone="success">Tu cuenta de Google quedó vinculada.</Alert>;
  const message = result && Object.hasOwn(messages, result) ? messages[result] : null;
  return message && <Alert tone="error">{message}</Alert>;
}
