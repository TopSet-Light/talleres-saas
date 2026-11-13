import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function AuthScreen({ title, description, badge, children }: {
  title: string;
  description?: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-screen">
      <header className="auth-identity">
        <Link to="/login" className="taller-brand">
          <span className="taller-symbol" aria-hidden="true">T</span>
          Tsgarage<span className="desktop-brand-label"> · Espacio de trabajo</span>
        </Link>
        <span className="mobile-access-label">Acceso</span>
      </header>
      <div className="auth-card">
        <div className="auth-heading">
          {badge && <span className="auth-badge">{badge}</span>}
          <h1>{title}</h1>
          {description && <p className="muted">{description}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}
