import type { SupabaseClient } from '@supabase/supabase-js';
import { validateRentalDraft, type RentalDraftValidationInput } from './rentalDomain';

type RentalStatus = 'pending' | 'confirmed' | 'ongoing' | 'completed' | 'cancelled';
type DeliveryMethod = 'delivery' | 'customer_pickup';
type RentalItemInput = { product_id: string; quantity: number; unit_price: number };

export type RentalWriteInput = Omit<RentalDraftValidationInput, 'items' | 'status' | 'deliveryMethod'> & {
  status: RentalStatus;
  deliveryMethod: DeliveryMethod;
  items: RentalItemInput[];
  responsibleUserIds?: string[];
};

export function createRentalRepository(client: SupabaseClient, companyId: string) {
  if (!companyId.trim()) throw new Error('A empresa ativa é obrigatória para acessar as locações.');

  return {
    async fetchCustomers() {
      const { data, error } = await client.from('customers')
        .select('id, company_id, name, phone, email, address, notes, cpf, rg, zip, neighborhood, city_state, created_at, updated_at')
        .eq('company_id', companyId).order('name');
      if (error) throw error;
      return data ?? [];
    },

    async fetchProducts() {
      const { data, error } = await client.from('products')
        .select('id, company_id, name, description, inventory_mode, total_quantity, daily_price, active, notes')
        .eq('company_id', companyId).eq('active', true).order('name');
      if (error) throw error;
      return data ?? [];
    },

    async fetchCompanyMembers() {
      const { data, error } = await client.from('company_members')
        .select('user_id, role').eq('company_id', companyId).order('created_at');
      if (error) throw error;
      const members = data ?? [];
      if (!members.length) return [];
      const { data: profiles, error: profileError } = await client.from('profiles')
        .select('id, full_name').in('id', members.map(member => member.user_id));
      if (profileError) throw profileError;
      const names = new Map((profiles ?? []).map(profile => [profile.id, profile.full_name || 'Funcionário']));
      return members.map(member => ({ ...member, name: names.get(member.user_id) ?? 'Funcionário' }));
    },

    async fetchRentals() {
      const { data, error } = await client.from('rentals').select(
        '*, customers(name), rental_items(id, product_id, quantity, unit_price, subtotal, products(name), rental_item_units(product_unit_id, product_units(asset_code))), rental_responsibles(user_id, employee_name_snapshot)',
      ).eq('company_id', companyId).order('start_date');
      if (error) throw error;
      return data ?? [];
    },

    async createRental(input: RentalWriteInput) {
      validateRentalDraft(input);
      if (!['pending', 'confirmed', 'ongoing'].includes(input.status)) {
        throw new Error('Uma nova locação só pode ser criada como pendente, confirmada ou em andamento.');
      }
      const { data, error } = await client.rpc('create_rental_with_items', {
        p_company_id: companyId,
        p_customer_id: input.customerId,
        p_start_date: input.startDate,
        p_end_date: input.endDate,
        p_start_time: input.startTime,
        p_end_time: input.endTime,
        p_status: input.status,
        p_delivery_method: input.deliveryMethod,
        p_total_amount: input.totalAmount,
        p_items: input.items,
        p_delivery_address: input.deliveryAddress ?? null,
        p_responsible_user_ids: input.responsibleUserIds ?? [],
      });
      if (error) throw error;
      return data as string;
    },

    async updateRental(rentalId: string, input: RentalWriteInput) {
      validateRentalDraft(input);
      const { error } = await client.rpc('update_rental_with_items', {
        p_company_id: companyId,
        p_rental_id: rentalId,
        p_customer_id: input.customerId,
        p_start_date: input.startDate,
        p_end_date: input.endDate,
        p_start_time: input.startTime,
        p_end_time: input.endTime,
        p_status: input.status,
        p_delivery_method: input.deliveryMethod,
        p_total_amount: input.totalAmount,
        p_items: input.items,
        p_delivery_address: input.deliveryAddress ?? null,
        p_responsible_user_ids: input.responsibleUserIds ?? [],
      });
      if (error) throw error;
    },

    async deleteRental(rentalId: string) {
      const { data, error } = await client.from('rentals').delete()
        .eq('id', rentalId).eq('company_id', companyId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A locação não foi encontrada ou você não tem permissão para excluí-la.');
    },
  };
}
