import type { ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
};

export function AppConfirmDialog({ open, title, description, confirmLabel = 'Confirmar', busy = false, onCancel, onConfirm, children }: Props) {
  if (!open) return null;
  return <div className="app-confirm-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <section className="app-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title" aria-describedby="app-confirm-description">
      <div className="app-confirm-icon" aria-hidden="true">!</div>
      <p className="eyebrow">CONFIRMAÇÃO</p>
      <h2 id="app-confirm-title">{title}</h2>
      <p id="app-confirm-description">{description}</p>
      {children}
      <div className="app-confirm-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Voltar</button>
        <button type="button" className="danger-button" disabled={busy} onClick={onConfirm}>{busy ? 'Aguarde...' : confirmLabel}</button>
      </div>
    </section>
  </div>;
}
