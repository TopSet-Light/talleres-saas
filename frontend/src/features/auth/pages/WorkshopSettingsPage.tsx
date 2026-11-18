import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../../shared/ui/Alert';
import { Field } from '../../../shared/ui/Field';
import { ApiError, currentSessionVersion, toApiError } from '../../../shared/api/http';
import { useSession } from '../session';
import { deleteLogo, getSettings, saveSettings, uploadLogo, type WorkshopSettings, type SettingsInput } from '../../workshop-settings/api';

export function WorkshopSettingsPage() {
  const { state, setMe } = useSession();
  const me = state.status === 'authenticated' ? state.me : null;
  const editable = !!me?.permissions.includes('settings.manage');
  const [settings, setSettings] = useState<WorkshopSettings>();
  const [error, setError] = useState<ApiError>();
  const [message, setMessage] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [logoError, setLogoError] = useState<string>();
  const [logoInput, setLogoInput] = useState(0);

  useEffect(() => {
    let active = true;
    getSettings().then(value => { if (active) setSettings(value); })
      .catch(caught => { if (active) setError(toApiError(caught)); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectLogo(selected?: File) {
    setFile(undefined);
    setPreview(undefined);
    setLogoError(undefined);
    if (!selected) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size > 2 * 1024 * 1024) {
      setLogoError('Elegí un PNG, JPEG o WebP de hasta 2 MB.');
      return;
    }
    setFile(selected);
  }

  async function changeLogo(remove = false) {
    if (!remove && !file) return;
    setBusy(true);
    setLogoError(undefined);
    setMessage(undefined);
    try {
      const logo = remove ? (await deleteLogo(), null) : (await uploadLogo(file!)).logo;
      // Conservar los datos comerciales que todavía no se guardaron.
      setSettings(current => current ? { ...current, logo } : current);
      setFile(undefined);
      setPreview(undefined);
      setLogoInput(value => value + 1);
      setMessage(remove ? 'Logo eliminado.' : 'Logo guardado.');
    } catch (caught) {
      setLogoError(toApiError(caught).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();
    const nullable = (name: string) => value(name) || null;
    const numbering = (kind: 'workOrder' | 'estimate') => ({
      prefix: value('numbering.' + kind + '.prefix'), next: Number(value('numbering.' + kind + '.next')),
    });
    const body: SettingsInput = {
      workshopName: value('workshopName'), taxId: nullable('taxId'), address: nullable('address'),
      locality: nullable('locality'), contactPhone: nullable('contactPhone'), contactEmail: nullable('contactEmail'),
      documentFooter: nullable('documentFooter'), defaultTerms: nullable('defaultTerms'),
      quoteValidityDays: Number(value('quoteValidityDays')),
      numbering: { workOrder: numbering('workOrder'), estimate: numbering('estimate') },
    };
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    const sessionVersion = currentSessionVersion();
    try {
      const saved = await saveSettings(body);
      setSettings(saved);
      setVersion(current => current + 1);
      if (me && sessionVersion === currentSessionVersion()) setMe({ ...me, workshop: { ...me.workshop, name: saved.workshopName } });
      setMessage('Configuración guardada.');
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  const fields = error?.fields ?? {};
  return (
    <>
    <div className="home-toolbar"><p>{me?.workshop.name} / Configuración</p></div>
    <main className="page workshop-settings">
      <Link to="/">‹ Inicio</Link>
      <h1><span className="settings-title-desktop">Configuración</span><span className="settings-title-mobile">Datos del taller</span></h1>
      <p className="muted">Datos comerciales, documentos y numeración del taller.</p>
      {error && <Alert tone="error">{error.message}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}
      {!settings ? error ? <button type="button" onClick={() => { setError(undefined); setAttempt(value => value + 1); }}>Reintentar</button>
        : <p role="status">Cargando configuración…</p> : (
        <>
          {!editable && <Alert tone="info">Tenés acceso de lectura a la configuración.</Alert>}
          <form key={version} onSubmit={save} noValidate className="settings-grid" aria-busy={busy}>
            <fieldset disabled={!editable || busy} className="settings-card">
              <legend className="form-section-title">Datos comerciales</legend>
              <Field label="Nombre comercial" name="workshopName" defaultValue={settings.workshopName} required maxLength={160} error={fields.workshopName} />
              <Field label="CUIT" name="taxId" defaultValue={settings.taxId ?? ''} error={fields.taxId} />
              <Field label="Domicilio" name="address" defaultValue={settings.address ?? ''} error={fields.address} />
              <Field label="Ciudad o localidad" name="locality" defaultValue={settings.locality ?? ''} error={fields.locality} />
              <Field label="Teléfono de contacto" name="contactPhone" type="tel" defaultValue={settings.contactPhone ?? ''} error={fields.contactPhone} />
              <Field label="Email de contacto" name="contactEmail" type="email" defaultValue={settings.contactEmail ?? ''} error={fields.contactEmail} />
            </fieldset>
            <fieldset disabled={!editable || busy} className="settings-card">
              <legend className="form-section-title">Documentos y numeración</legend>
              <Field label="Vigencia del presupuesto (días)" name="quoteValidityDays" type="number" min={1} max={365} defaultValue={settings.quoteValidityDays} error={fields.quoteValidityDays} />
              <label className="field">Condiciones predeterminadas<textarea name="defaultTerms" maxLength={2000} defaultValue={settings.defaultTerms ?? ''} aria-invalid={!!fields.defaultTerms} />{fields.defaultTerms && <span className="field-error">{fields.defaultTerms}</span>}</label>
              <label className="field">Pie de los documentos<textarea name="documentFooter" defaultValue={settings.documentFooter ?? ''} aria-invalid={!!fields.documentFooter} />{fields.documentFooter && <span className="field-error">{fields.documentFooter}</span>}</label>
              {(['workOrder', 'estimate'] as const).map(kind => (
                <div className="numbering-fields" key={kind}>
                  <Field label={'Prefijo de ' + (kind === 'workOrder' ? 'orden' : 'presupuesto')} name={'numbering.' + kind + '.prefix'} defaultValue={settings.numbering[kind].prefix} maxLength={10} error={fields['numbering.' + kind + '.prefix']} />
                  <Field label={kind === 'workOrder' ? 'Próxima orden' : 'Próximo presupuesto'} name={'numbering.' + kind + '.next'} type="number" min={1} max={999999999} defaultValue={settings.numbering[kind].next} error={fields['numbering.' + kind + '.next']} />
                </div>
              ))}
              <p className="field-hint">La numeración no puede retroceder.</p>
              {editable && <button disabled={busy}>{busy ? 'Guardando…' : 'Guardar configuración'}</button>}
            </fieldset>
          </form>
          <section className="settings-card logo-card" aria-label="Logo del taller">
            <h2 className="form-section-title">Logo del taller</h2>
            {logoError && <Alert tone="error">{logoError}</Alert>}
            {(preview || settings.logo) && <img className="workshop-logo-preview" src={preview ?? '/api/workshop-settings/logo?v=' + encodeURIComponent(settings.logo!.updatedAt)} alt={preview ? 'Vista previa del logo' : 'Logo actual del taller'} onError={() => setLogoError('No pudimos mostrar el logo. Volvé a cargarlo.')} />}
            {editable && <>
              <Field key={logoInput} label="Seleccionar logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} hint="PNG, JPEG o WebP de hasta 2 MB. Se guarda por separado de los datos comerciales." onChange={event => selectLogo(event.currentTarget.files?.[0])} />
              <div className="actions"><button type="button" disabled={busy || !file} onClick={() => void changeLogo()}>Guardar logo</button>
                {settings.logo && <button type="button" className="secondary" disabled={busy} onClick={() => void changeLogo(true)}>Eliminar logo</button>}</div>
            </>}
          </section>
        </>
      )}
      {me?.permissions.includes('employees.read') && <section className="settings-card"><h2 className="form-section-title">Administración</h2><Link className="button-link" to="/empleados">Equipo y accesos</Link></section>}
    </main>
    </>
  );
}
