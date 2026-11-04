import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Company-scoped data access for the React desktop/web migration.
 * RLS remains the authorization boundary; companyId filters keep queries
 * explicit and aligned with the existing application.
 */
export function createCompanyDataRepository(
  client: SupabaseClient,
  companyId: string,
) {
  return {
    async fetchCustomers() {
      const { data, error } = await client
        .from('customers')
        .select('id, company_id, name, phone, email, address, notes, created_at, updated_at')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },

    async fetchProducts() {
      const { data, error } = await client
        .from('products')
        .select('id, company_id, name, description, inventory_mode, total_quantity, daily_price, active, notes')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },

    async fetchProductUnits() {
      const { data, error } = await client
        .from('product_units')
        .select('id, company_id, product_id, asset_code, description, status')
        .eq('company_id', companyId)
        .order('asset_code');
      if (error) throw error;
      return data ?? [];
    },

    async fetchRentals() {
      const { data, error } = await client
        .from('rentals')
        .select(
          '*, customers(name), rental_items(id, product_id, quantity, unit_price, subtotal, ' +
          'products(name), rental_item_units(product_unit_id, product_units(asset_code)))',
        )
        .eq('company_id', companyId)
        .order('start_date');
      if (error) throw error;
      return data ?? [];
    },

    async saveCustomer(input: {
      id?: string;
      name: string;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      notes?: string | null;
    }) {
      const name = input.name.trim();
      if (!name) throw new Error('Informe o nome do cliente.');
      const values = {
        name,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
      };
      const query = input.id
        ? client.from('customers').update(values).eq('id', input.id).eq('company_id', companyId)
        : client.from('customers').insert({ company_id: companyId, ...values });
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data;
    },
  };
}
