import { request } from '../../shared/api/http';
import type { Role } from '../../shared/lib/format';

export type Me = {
  user: { id: string; name: string; email: string };
  workshop: { id: string; name: string };
  role: Role;
  permissions: string[];
};

export type InvitationPreview = { workshopName: string; email: string; role: Role; expiresAt: string };
export type RegistrationPreview = { workshopName: string; ownerName: string; email: string; expiresAt: string };

type Message = { message: string };

export const getMe = () => request<Me>('/auth/me');
export const login = (email: string, password: string) => request<Me>('/auth/login', { method: 'POST', body: { email, password } });
export const logout = () => request<void>('/auth/logout', { method: 'POST' });
// El registro no lleva contraseña: se elige al abrir el enlace enviado al email.
export const register = (body: {
  workshopName: string; ownerName: string; email: string; contactPhone: string; locality: string; address: string;
}) =>
  request<Message>('/auth/register', { method: 'POST', body });
export const previewRegistration = (token: string) =>
  request<RegistrationPreview>('/auth/registration/preview', { method: 'POST', body: { token } });
export const completeRegistration = (token: string, password: string) =>
  request<Message>('/auth/registration/complete', { method: 'POST', body: { token, password } });
export const previewInvitation = (token: string) => request<InvitationPreview>('/invitations/preview', { method: 'POST', body: { token } });
export const acceptInvitation = (body: { token: string; name: string; password: string }) =>
  request<Message>('/invitations/accept', { method: 'POST', body });
