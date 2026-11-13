import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../../shared/ui/Alert';
import { Field } from '../../../shared/ui/Field';
import { useMe } from '../session';

export function WorkshopSettingsPage() {
  const me = useMe();
  const [logo, setLogo] = useState<string>();
  const [logoError, setLogoError] = useState<string>();

  useEffect(() => () => {
    if (logo) URL.revokeObjectURL(logo);
  }, [logo]);

  function previewLogo(file?: File) {
    setLogo(undefined);
    setLogoError(undefined);
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setLogoError('Elegí un PNG, JPEG o WebP de hasta 2 MB.');
      return;
    }
    setLogo(URL.createObjectURL(file));
  }

  return (
    <main className="page workshop-settings">
      <h1>Datos del taller</h1>
      <p className="muted">Configuración comercial y documentos.</p>
      {me?.permissions.includes('employees.read') && <Link className="button-link" to="/empleados">Equipo y accesos</Link>}
      <Alert tone="info">Todavía no se pueden guardar cambios. Podés previsualizar un logo en este navegador.</Alert>
      <section>
        <h2 className="form-section-title">Datos comerciales</h2>
        <form onSubmit={event => event.preventDefault()}>
          <Field label="Nombre comercial" name="workshopName" defaultValue={me?.workshop.name} disabled />
          <Field label="CUIT" name="taxId" disabled />
          <Field label="Domicilio" name="address" disabled />
          <Field label="Logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp"
            error={logoError} onChange={event => previewLogo(event.currentTarget.files?.[0])} />
          {logo && <img className="workshop-logo-preview" src={logo} alt="Vista previa del logo" />}
          <Field label="Vigencia por defecto (días)" name="quoteValidity" type="number" disabled />
          <Field label="Condiciones predeterminadas" name="defaultTerms" disabled />
          <Field label="Próxima orden" name="nextWorkOrder" type="number" disabled />
          <Field label="Próximo presupuesto" name="nextQuote" type="number" disabled />
          <button type="submit" disabled>Guardar configuración</button>
        </form>
      </section>
    </main>
  );
}
