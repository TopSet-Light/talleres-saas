import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function AuthScreen({ title, description, badge, variant = 'access', tone = 'info', children }: {
  title: string;
  description?: ReactNode;
  badge?: string;
  variant?: 'access' | 'card' | 'notice';
  tone?: 'info' | 'warning' | 'danger' | 'success';
  children: ReactNode;
}) {
  return (
    <main className={`auth-screen auth-screen-${variant}`}>
      <header className="auth-identity">
        <Link to="/login" className="taller-brand">
          <span className="taller-symbol" aria-hidden="true">T</span>
          <span>Tsgarage<span className="desktop-brand-label"> · Espacio de trabajo</span></span>
        </Link>
        <span className="mobile-access-label">Acceso</span>
      </header>
      <div className="auth-card">
        <div className="auth-heading">
          {badge && <span className={`auth-badge auth-badge-${tone}`}>{badge}</span>}
          <h1>{title}</h1>
          {description && <p className="muted">{description}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}
