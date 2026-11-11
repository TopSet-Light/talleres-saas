import { ReactNode } from 'react';

export function Alert({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`alert alert-${tone}`}>{children}</div>;
}
