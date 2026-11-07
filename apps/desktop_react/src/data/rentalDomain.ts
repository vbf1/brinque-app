export type RentalDraftItem = {
  product_id: string;
  quantity: number;
  unit_price: number;
};

export type RentalDraftValidationInput = {
  customerId: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  status: string;
  deliveryMethod: string;
  totalAmount: number;
  items: RentalDraftItem[];
  deliveryAddress?: string | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Shared client-side guard; database RPC remains authoritative for permissions and stock. */
export function validateRentalDraft(input: RentalDraftValidationInput): void {
  if (!input.customerId.trim()) throw new Error('Selecione um cliente.');
  if (!isRealDate(input.startDate) || !isRealDate(input.endDate) || input.endDate < input.startDate) {
    throw new Error('Informe um período válido para a locação.');
  }
  if (!TIME_PATTERN.test(input.startTime) || !TIME_PATTERN.test(input.endTime)) {
    throw new Error('Informe horários válidos para a locação.');
  }
  if (input.startDate === input.endDate && input.endTime <= input.startTime) {
    throw new Error('O horário de término precisa ser posterior ao início.');
  }
  if (!['pending', 'confirmed', 'ongoing', 'completed', 'cancelled'].includes(input.status)) {
    throw new Error('Status de locação inválido.');
  }
  if (!['delivery', 'customer_pickup'].includes(input.deliveryMethod)) {
    throw new Error('Selecione uma modalidade de entrega válida.');
  }
  if (input.deliveryMethod === 'delivery' && !input.deliveryAddress?.trim()) {
    throw new Error('Informe o endereço de entrega.');
  }
  if (!Number.isFinite(input.totalAmount) || input.totalAmount < 0) {
    throw new Error('Informe um valor total válido.');
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('Adicione pelo menos um brinquedo à locação.');
  }
  const productIds = new Set<string>();
  for (const item of input.items) {
    if (!item.product_id?.trim()) throw new Error('Selecione todos os brinquedos.');
    if (productIds.has(item.product_id)) throw new Error('Cada brinquedo deve aparecer apenas uma vez; ajuste a quantidade no próprio item.');
    productIds.add(item.product_id);
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error('A quantidade de cada brinquedo deve ser um número inteiro maior que zero.');
    }
    if (!Number.isFinite(item.unit_price) || item.unit_price < 0) {
      throw new Error('O preço unitário de cada brinquedo deve ser zero ou maior.');
    }
  }
}
