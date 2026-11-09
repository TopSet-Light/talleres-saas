import { request } from '../../shared/api/http';
import type { Role } from '../../shared/lib/format';

export type Me = {
  user: { id: string; name: string; email: string };
  workshop: { id: string; name: string };
  role: Role;
  permissions: string[];
};

export type InvitationPreview = { workshopName: string; email: string; role: Role; expiresAt: string };

type Message = { message: string };

export const getMe = () => request<Me>('/auth/me');
export const login = (email: string, password: string) => request<Me>('/auth/login', { method: 'POST', body: { email, password } });
export const logout = () => request<void>('/auth/logout', { method: 'POST' });
export const register = (body: { workshopName: string; ownerName: string; email: string; password: string }) =>
  request<Message>('/auth/register', { method: 'POST', body });
export const resendVerification = (email: string) => request<Message>('/auth/resend-verification', { method: 'POST', body: { email } });
export const previewInvitation = (token: string) => request<InvitationPreview>('/invitations/preview', { method: 'POST', body: { token } });
export const acceptInvitation = (body: { token: string; name: string; password: string }) =>
  request<Message>('/invitations/accept', { method: 'POST', body });

// Un enlace de verificación es de un solo uso: compartir el pedido evita que
// el doble montaje de React en desarrollo lo consuma dos veces.
const verifications = new Map<string, Promise<Message>>();
export function verifyEmail(token: string) {
  let pending = verifications.get(token);
  if (!pending) {
    pending = request<Message>('/auth/verify-email', { method: 'POST', body: { token } });
    verifications.set(token, pending);
  }
  return pending;
}
