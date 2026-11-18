import { Field } from '../../shared/ui/Field';
import type { WorkshopDetails } from './api';

export function readWorkshopDetails(form: FormData): WorkshopDetails {
  return {
    workshopName: String(form.get('workshopName') ?? ''),
    contactPhone: String(form.get('contactPhone') ?? ''),
    locality: String(form.get('locality') ?? ''),
    address: String(form.get('address') ?? ''),
  };
}

export function WorkshopContactFields({ errors }: { errors?: Record<string, string> }) {
  return (
    <>
      <Field label="Teléfono de contacto" name="contactPhone" type="tel" autoComplete="tel" required maxLength={40}
        placeholder="Ej. +54 11 2345-6789" error={errors?.contactPhone} />
      <div className="auth-field-pair">
        <Field label="Localidad o ciudad del taller" name="locality" autoComplete="address-level2" required maxLength={120}
          placeholder="Ej. Córdoba" error={errors?.locality} />
        <Field label="Dirección" name="address" autoComplete="street-address" required maxLength={300}
          placeholder="Ej. Av. Colón 1234" error={errors?.address} />
      </div>
    </>
  );
}
