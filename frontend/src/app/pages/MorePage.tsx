import { Link } from 'react-router';
import { useMe } from '../../features/auth/session';

const modules = [
  ['Clientes', 'Personas y empresas'],
  ['Vehículos', 'Patentes, titularidad e historial'],
  ['Presupuestos', 'Cotizaciones y conversiones a OT'],
  ['Liquidaciones y cobros', 'Anticipos, pagos y saldos'],
  ['Productos y stock', 'Catálogo y movimientos'],
];

function ModuleLabel({ title, description }: { title: string; description: string }) {
  return (
    <>
      <span><strong>{title}</strong><small>{description}</small></span>
      <span className="more-chevron" aria-hidden="true">›</span>
    </>
  );
}

export function MorePage() {
  const me = useMe();
  const settings = <ModuleLabel title="Configuración" description="Solo Dueño / Administrador" />;

  return (
    <main className="more-page">
      <h1>Más</h1>
      <p>Accedé a los módulos del taller.</p>
      <ul className="more-modules" aria-label="Módulos del taller">
        {modules.map(([title, description]) => (
          <li key={title}><div className="more-module" aria-disabled="true"><ModuleLabel title={title} description={description} /></div></li>
        ))}
        <li>
          {me?.role === 'OWNER'
            ? <Link className="more-module" to="/configuracion">{settings}</Link>
            : <div className="more-module" aria-disabled="true">{settings}</div>}
        </li>
      </ul>
    </main>
  );
}
