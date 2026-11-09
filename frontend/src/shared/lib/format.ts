export type Role = 'OWNER' | 'RECEPTION' | 'MECHANIC';

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Dueño/Administrador',
  RECEPTION: 'Recepción',
  MECHANIC: 'Mecánico',
};

export const ROLES = Object.keys(ROLE_LABELS) as Role[];

const dateTime = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });

export function formatDateTime(value: string) {
  return dateTime.format(new Date(value));
}

/** Los enlaces de los emails llevan el token en el fragmento: #token=... */
export function tokenFromHash(hash: string) {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
