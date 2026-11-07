type CustomerOption = { id: string; name: string };

type CustomerPickerProps = {
  customers: CustomerOption[];
  value: string;
  onChange: (customerId: string) => void;
  companyId: string;
  diagnostic?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
};

/**
 * Use the browser's native select control for customer choice.
 * This avoids custom popover/focus/stacking behavior on mobile browsers and
 * Android WebView while keeping the data source controlled by RentalsPage.
 */
export function CustomerPicker({
  customers,
  value,
  onChange,
  companyId,
  diagnostic = '',
  disabled = false,
  loading = false,
  error = '',
}: CustomerPickerProps) {
  return (
    <div className="rental-customer-picker" style={{ display: 'grid', gap: 6, width: '100%' }}>
      <select
        aria-label="Selecionar cliente"
        value={value}
        required
        disabled={disabled || loading || Boolean(error)}
        onChange={event => onChange(event.target.value)}
      >
        <option value="">
          {loading
            ? 'Carregando clientes...'
            : error
              ? 'Não foi possível carregar os clientes'
              : customers.length
                ? 'Selecione um cliente'
                : 'Nenhum cliente cadastrado nesta empresa'}
        </option>
        {customers.map(customer => (
          <option key={customer.id} value={customer.id}>
            {customer.name}
          </option>
        ))}
      </select>
      <small className="module-description" aria-live="polite">
        {loading
          ? 'Consultando clientes no Supabase...'
          : error
            ? 'A consulta retornou um erro.'
            : `${customers.length} cliente(s) retornado(s) pela consulta.`}
      </small>
      <small className="module-description" style={{ overflowWrap: 'anywhere' }}>
        Empresa consultada: {companyId}
      </small>
      {diagnostic && (
        <small className="module-description" style={{ overflowWrap: 'anywhere' }}>
          Diagnóstico: {diagnostic}
        </small>
      )}
      {error && <p role="alert" className="module-feedback">{error}</p>}
    </div>
  );
}
