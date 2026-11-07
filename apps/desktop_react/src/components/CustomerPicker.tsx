import { useMemo, useState } from 'react';

type CustomerOption = { id: string; name: string };

type CustomerPickerProps = {
  customers: CustomerOption[];
  value: string;
  onChange: (customerId: string) => void;
  disabled?: boolean;
};

export function CustomerPicker({ customers, value, onChange, disabled = false }: CustomerPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = customers.find(customer => customer.id === value);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return customers.filter(customer => !term || customer.name.toLocaleLowerCase('pt-BR').includes(term));
  }, [customers, query]);

  return (
    <div className="rental-customer-picker" style={{ position: 'relative', width: '100%' }}>
      <input
        type="search"
        role="combobox"
        aria-label="Pesquisar e selecionar cliente"
        aria-autocomplete="list"
        aria-expanded={open}
        placeholder={selected ? selected.name : 'Digite para pesquisar um cliente...'}
        value={query}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter' && filtered.length === 1) {
            event.preventDefault();
            onChange(filtered[0].id);
            setQuery('');
            setOpen(false);
          }
        }}
      />
      {open && !disabled && (
        <div role="listbox" aria-label="Clientes disponíveis" className="rental-customer-options"
          style={{ position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: 240, overflowY: 'auto', background: 'var(--panel, #fff)', border: '1px solid var(--border, #d1d5db)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.14)' }}>
          {filtered.length ? filtered.map(customer => (
            <button key={customer.id} type="button" role="option" aria-selected={customer.id === value}
              onMouseDown={event => event.preventDefault()}
              onClick={() => { onChange(customer.id); setQuery(''); setOpen(false); }}
              style={{ display: 'block', width: '100%', padding: '12px 14px', textAlign: 'left', border: 0, borderBottom: '1px solid var(--border, #eee)', background: customer.id === value ? 'var(--accent-soft, #eef6f1)' : 'transparent', color: 'inherit', cursor: 'pointer' }}>
              {customer.name}
            </button>
          )) : <p style={{ padding: '12px 14px', margin: 0 }}>{customers.length ? 'Nenhum cliente corresponde à pesquisa.' : 'Nenhum cliente cadastrado nesta empresa.'}</p>}
        </div>
      )}
      <small className="module-description">{customers.length} cliente(s) disponível(is){selected ? ' · Selecionado: ' + selected.name : ''}</small>
    </div>
  );
}
