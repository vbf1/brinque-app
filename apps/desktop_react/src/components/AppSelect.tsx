import { useEffect, useRef, useState } from 'react';

export type SelectOption = { value: string; label: string };

type AppSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  'aria-label'?: string;
};

export function AppSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecione uma opção',
  disabled = false,
  required = false,
  id,
  'aria-label': ariaLabel,
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find(option => option.value === value);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  return (
    <div className={'app-select' + (open ? ' is-open' : '')} ref={rootRef}>
      <button
        id={id}
        type="button"
        className="app-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
      >
        <span className={selected ? 'app-select-value' : 'app-select-placeholder'}>
          {selected?.label ?? placeholder}
        </span>
        <span className="app-select-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="app-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map(option => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={'app-select-option' + (option.value === value ? ' selected' : '')}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <span className="app-select-check" aria-hidden="true">✓</span>}
            </button>
          ))}
          {!options.length && <span className="app-select-empty">Nenhuma opção disponível</span>}
        </div>
      )}
    </div>
  );
}
