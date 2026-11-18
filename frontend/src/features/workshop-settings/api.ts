import { request } from '../../shared/api/http';

export type Numbering = { prefix: string; next: number };
export type SettingsInput = {
  workshopName: string;
  taxId: string | null;
  address: string | null;
  locality: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  documentFooter: string | null;
  quoteValidityDays: number;
  defaultTerms: string | null;
  numbering: { workOrder: Numbering; estimate: Numbering };
};
export type WorkshopSettings = SettingsInput & {
  logo: { url: string; updatedAt: string; contentType: string; size: number } | null;
  updatedAt: string;
};

export const getSettings = () => request<WorkshopSettings>('/workshop-settings');
export const saveSettings = (body: SettingsInput) => request<WorkshopSettings>('/workshop-settings', { method: 'PUT', body });
export const uploadLogo = (file: File) => {
  const body = new FormData();
  body.set('logo', file);
  return request<WorkshopSettings>('/workshop-settings/logo', { method: 'PUT', body });
};
export const deleteLogo = () => request<void>('/workshop-settings/logo', { method: 'DELETE' });
