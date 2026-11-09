import { request } from '../../shared/api/http';
import type { Role } from '../../shared/lib/format';

export type Employee = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  isCurrentUser: boolean;
};

export type Invitation = { id: string; email: string; role: Role; createdAt: string; expiresAt: string };

export const listEmployees = () => request<Employee[]>('/employees');
export const updateEmployee = (id: string, body: { role?: Role; status?: Employee['status'] }) =>
  request<Employee>(`/employees/${encodeURIComponent(id)}`, { method: 'PATCH', body });
export const listInvitations = () => request<Invitation[]>('/invitations');
export const createInvitation = (email: string, role: Role) =>
  request<Invitation & { emailSent: boolean }>('/invitations', { method: 'POST', body: { email, role } });
export const revokeInvitation = (id: string) => request<void>(`/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' });
