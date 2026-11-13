import { useMe } from '../../features/auth/session';

const indicators = [
  'Vehículos en el taller',
  'Listos para entregar',
  'Saldo pendiente',
  'Presupuestos sin respuesta',
  'Alerta de stock mínimo',
  'Órdenes activas',
];

const dateLabel = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires',
});

export function HomePage() {
  const me = useMe();
  if (!me) return null;

  return (
    <main className="home-page">
      <div className="home-toolbar">
        <p>Taller SaaS / Inicio</p>
        <label className="home-search"><span aria-hidden="true">⌕</span>
          <input type="search" aria-label="Buscar patente, cliente u orden" placeholder="Buscar patente, cliente u OT" disabled />
        </label>
      </div>
      <div className="home-content">
        <header className="home-heading">
          <div>
            <p className="eyebrow">Panel de recepción</p>
            <h1>Inicio</h1>
            <p className="muted home-date">{dateLabel.format(new Date())} · Resumen del taller</p>
          </div>
          {me.permissions.includes('workOrders.open') && <button className="home-desktop-intake" type="button" disabled>+ Nuevo ingreso</button>}
        </header>

        {me.permissions.includes('workOrders.open') && (
          <section className="home-mobile-intake" aria-labelledby="home-intake-title">
            <small>Recepción</small>
            <h2 id="home-intake-title">Registrá un ingreso</h2>
            <p>Creá una OT al recibir un vehículo.</p>
            <button className="secondary" type="button" disabled>+ Nuevo ingreso</button>
          </section>
        )}

        <div className="home-indicators" aria-label="Indicadores del taller">
          {indicators.map(label => (
            <div className="home-indicator" key={label}>
              <span>{label === 'Presupuestos sin respuesta' ? <><span className="home-label-desktop">{label}</span><span className="home-label-mobile">Presupuestos enviados</span></> : label}</span>
              <strong aria-label="Dato no disponible">—</strong>
            </div>
          ))}
        </div>

        <section className="home-priorities" aria-labelledby="home-priorities-title">
          <div className="home-heading">
            <div>
              <h2 id="home-priorities-title"><span className="home-label-desktop">Prioridades de hoy</span><span className="home-label-mobile">Prioridad de hoy</span></h2>
              <p className="muted home-label-desktop">Operación del taller</p>
            </div>
            <button type="button" className="secondary" disabled>Ver órdenes</button>
          </div>
          <div className="home-priority-empty">
            <strong>Prioridades del taller</strong>
            <p className="muted">Pendientes de datos operativos.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
