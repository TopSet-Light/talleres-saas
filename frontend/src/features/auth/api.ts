import { request } from '../../shared/api/http';
import type { Role } from '../../shared/lib/format';

export type Me = {
  user: { id: string; name: string; email: string };
  workshop: { id: string; name: string };
  role: Role;
  permissions: string[];
  googleLinked?: boolean;
  passwordConfigured?: boolean;
};

export type InvitationPreview = { workshopName: string; email: string; role: Role; expiresAt: string };
export type RegistrationPreview = { workshopName: string; ownerName: string; email: string; expiresAt: string };

type Message = { message: string };

export const getMe = () => request<Me>('/auth/me');
export const getAuthOptions = () => request<{ google: boolean }>('/auth/options');
export const checkGoogleRegistration = () => request<void>('/auth/google/registration');
export const unlinkGoogle = () => request<void>('/auth/google/link', { method: 'DELETE' });

export type WorkshopDetails = { workshopName: string; contactPhone: string; locality: string; address: string };
export const completeGoogleRegistration = (body: WorkshopDetails) =>
  request<Me>('/auth/google/registration', { method: 'POST', body });
export const forgotPassword = (email: string) => request<Message>('/auth/password/forgot', { method: 'POST', body: { email } });
export const previewPasswordReset = (token: string) =>
  request<{ email: string; expiresAt: string }>('/auth/password/reset/preview', { method: 'POST', body: { token } });
export const resetPassword = (token: string, password: string) =>
  request<Message>('/auth/password/reset', { method: 'POST', body: { token, password } });
export const login = (email: string, password: string) => request<Me>('/auth/login', { method: 'POST', body: { email, password } });
export const logout = () => request<void>('/auth/logout', { method: 'POST' });
// El registro no lleva contraseña: se elige al abrir el enlace enviado al email.
export const register = (body: WorkshopDetails & { ownerName: string; email: string }) =>
  request<Message>('/auth/register', { method: 'POST', body });
export const previewRegistration = (token: string) =>
  request<RegistrationPreview>('/auth/registration/preview', { method: 'POST', body: { token } });
export const completeRegistration = (token: string, password: string) =>
  request<Message>('/auth/registration/complete', { method: 'POST', body: { token, password } });
export const previewInvitation = (token: string) => request<InvitationPreview>('/invitations/preview', { method: 'POST', body: { token } });
export const acceptInvitation = (body: { token: string; name: string; password: string }) =>
  request<Message>('/invitations/accept', { method: 'POST', body });
