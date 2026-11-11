import { InputHTMLAttributes, ReactNode, useId } from 'react';

type Props = { label: string; name: string; error?: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>;

export function Field({ label, name, error, hint, ...input }: Props) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
      {error && <p id={`${id}-error`} className="field-error">{error}</p>}
    </div>
  );
}
