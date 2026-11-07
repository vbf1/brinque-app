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
        .select('id, company_id, name, phone, email, address, notes, cpf, rg, zip, neighborhood, city_state, created_at, updated_at')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },


    async fetchCompanyMembers() {
      const { data: members, error } = await client
        .from('company_members')
        .select('user_id, role')
        .eq('company_id', companyId)
        .order('created_at');
      if (error) throw error;
      const rows = members ?? [];
      if (!rows.length) return [];
      const { data: profiles, error: profileError } = await client
        .from('profiles')
        .select('id, full_name')
        .in('id', rows.map(row => row.user_id));
      if (profileError) throw profileError;
      const names = new Map((profiles ?? []).map(profile => [profile.id, profile.full_name || 'Funcionário']));
      return rows.map(row => ({ ...row, name: names.get(row.user_id) ?? 'Funcionário' }));
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
    async setProductUnitStatus(unitId: string, status: 'available' | 'maintenance') {
      const { data: unit, error: unitError } = await client.from('product_units')
        .select('id, product_id, status').eq('id', unitId)
        .eq('company_id', companyId).single();
      if (unitError) throw unitError;
      if (status === 'maintenance') {
        const { error } = await client.from('maintenance_records').insert({
          company_id: companyId, product_id: unit.product_id, product_unit_id: unit.id,
          description: 'Unidade enviada para manutenção pelo controle de estoque.',
          status: 'open',
        });
        if (error) throw error;
      } else if (unit.status === 'maintenance') {
        const { error } = await client.from('maintenance_records').update({
          status: 'completed', completed_at: new Date().toISOString().slice(0, 10),
        }).eq('product_unit_id', unit.id).eq('company_id', companyId).eq('status', 'open');
        if (error) throw error;
      }
      const { data, error } = await client.from('product_units').update({ status })
        .eq('id', unitId).eq('company_id', companyId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Unidade não encontrada ou sem permissão para atualizar.');
    },


    async createRentalWithItems(input: {
      customerId: string;
      startDate: string;
      endDate: string;
      startTime: string;
      endTime: string;
      status: 'pending' | 'confirmed' | 'ongoing';
      deliveryMethod: 'delivery' | 'customer_pickup';
      totalAmount: number;
      items: Array<{ product_id: string; quantity: number; unit_price: number }>;
      deliveryAddress?: string | null;
      responsibleUserIds?: string[];
    }) {
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

    async updateRentalWithItems(input: {
      rentalId: string;
      customerId: string;
      startDate: string;
      endDate: string;
      startTime: string;
      endTime: string;
      status: 'pending' | 'confirmed' | 'ongoing' | 'completed' | 'cancelled';
      deliveryMethod: 'delivery' | 'customer_pickup';
      totalAmount: number;
      items: Array<{ product_id: string; quantity: number; unit_price: number }>;
      deliveryAddress?: string | null;
      responsibleUserIds?: string[];
    }) {
      const { error } = await client.rpc('update_rental_with_items', {
        p_company_id: companyId,
        p_rental_id: input.rentalId,
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

    async fetchRentals() {
      const { data, error } = await client
        .from('rentals')
        .select(
          '*, customers(name), rental_items(id, product_id, quantity, unit_price, subtotal, ' +
          'products(name), rental_item_units(product_unit_id, product_units(asset_code))), ' +
          'rental_responsibles(user_id, employee_name_snapshot)',
        )
        .eq('company_id', companyId)
        .order('start_date');
      if (error) throw error;
      return data ?? [];
    },



    async deleteRental(rentalId: string) {
      const { data, error } = await client.from('rentals')
        .delete()
        .eq('id', rentalId)
        .eq('company_id', companyId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A locação não foi encontrada ou você não tem permissão para excluí-la.');
    },

    async saveProduct(input: {
      id?: string;
      name: string;
      inventoryMode: 'quantity' | 'individual';
      quantity: number;
      dailyPrice: number;
    }) {
      const name = input.name.trim();
      if (!name || !Number.isInteger(input.quantity) || input.quantity < 1 || input.dailyPrice < 0) {
        throw new Error('Confira o nome, a quantidade e o preço diário.');
      }
      if (!input.id) {
        const { data: created, error } = await client.from('products').insert({
          company_id: companyId, name, inventory_mode: input.inventoryMode,
          total_quantity: input.quantity, daily_price: input.dailyPrice,
        }).select().single();
        if (error) throw error;
        if (input.inventoryMode === 'individual') {
          const { error: unitsError } = await client.from('product_units').insert(
            Array.from({ length: input.quantity }, (_, index) => ({
              company_id: companyId, product_id: created.id,
              asset_code: String(index + 1).padStart(2, '0'), status: 'available',
            })),
          );
          if (unitsError) {
            await client.from('products').delete().eq('id', created.id).eq('company_id', companyId);
            throw unitsError;
          }
        }
        return created;
      }

      const { data: existing, error: existingError } = await client.from('products')
        .select('id, inventory_mode').eq('id', input.id).eq('company_id', companyId).single();
      if (existingError) throw existingError;
      if (existing.inventory_mode === 'individual') {
        const { data: units, error: unitsError } = await client.from('product_units')
          .select('id, asset_code, status').eq('product_id', input.id).eq('company_id', companyId);
        if (unitsError) throw unitsError;
        const current = units ?? [];
        if (input.quantity < current.length) {
          const removable = current.filter(unit => unit.status === 'available');
          const excess = current.length - input.quantity;
          if (removable.length < excess) throw new Error('Não é possível reduzir: existem unidades reservadas, em manutenção ou indisponíveis.');
          const { data: references, error: referencesError } = await client.from('rental_item_units')
            .select('product_unit_id').in('product_unit_id', removable.map(unit => unit.id));
          if (referencesError) throw referencesError;
          const used = new Set((references ?? []).map(row => row.product_unit_id));
          const safe = removable.filter(unit => !used.has(unit.id));
          if (safe.length < excess) throw new Error('Não é possível excluir unidades que possuem histórico de locação.');
          const { error: deleteError } = await client.from('product_units').delete()
            .eq('company_id', companyId).in('id', safe.slice(0, excess).map(unit => unit.id));
          if (deleteError) throw deleteError;
        } else if (input.quantity > current.length) {
          const maxCode = current.reduce((max, unit) => Math.max(max, Number.parseInt(unit.asset_code ?? '', 10) || 0), 0);
          const { error: addError } = await client.from('product_units').insert(
            Array.from({ length: input.quantity - current.length }, (_, index) => ({
              company_id: companyId, product_id: input.id,
              asset_code: String(maxCode + index + 1).padStart(2, '0'), status: 'available',
            })),
          );
          if (addError) throw addError;
        }
      } else if (existing.inventory_mode !== input.inventoryMode) {
        throw new Error('O tipo de controle do estoque não pode ser alterado após o cadastro.');
      }
      const { data, error } = await client.from('products').update({
        name, total_quantity: input.quantity, daily_price: input.dailyPrice,
      }).eq('id', input.id).eq('company_id', companyId).select().single();
      if (error) throw error;
      return data;
    },

    async fetchTransactions() {
      const { data, error } = await client.from('financial_transactions')
        .select('id, company_id, transaction_type, description, amount, status, paid_at, created_at')
        .eq('company_id', companyId).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },

    async saveTransaction(input: { id?: string; type: 'income' | 'expense'; description: string; amount: number }) {
      const description = input.description.trim();
      if (!description || !Number.isFinite(input.amount) || input.amount <= 0) {
        throw new Error('Informe descrição e um valor maior que zero.');
      }
      const values = { transaction_type: input.type, description, amount: input.amount };
      if (input.id) {
        const { data, error } = await client.from('financial_transactions').update(values)
          .eq('id', input.id).eq('company_id', companyId).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await client.from('financial_transactions').insert({
        company_id: companyId, ...values, status: 'paid',
        paid_at: new Date().toISOString().slice(0, 10),
      }).select().single();
      if (error) throw error;
      return data;
    },

    async deleteTransaction(id: string) {
      const { data, error } = await client.from('financial_transactions').delete()
        .eq('id', id).eq('company_id', companyId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Lançamento não encontrado ou sem permissão para excluir.');
    },

    async saveCustomer(input: {
      id?: string;
      name: string;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      notes?: string | null;
      cpf?: string | null; rg?: string | null; zip?: string | null; neighborhood?: string | null; city_state?: string | null;
    }) {
      const name = input.name.trim();
      if (!name) throw new Error('Informe o nome do cliente.');
      const values = {
        name,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
        cpf: input.cpf?.trim() || null, rg: input.rg?.trim() || null, zip: input.zip?.trim() || null,
        neighborhood: input.neighborhood?.trim() || null, city_state: input.city_state?.trim() || null,
      };
      if (input.id) {
        const { data, error } = await client
          .from('customers')
          .update(values)
          .eq('id', input.id)
          .eq('company_id', companyId)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await client
        .from('customers')
        .insert({ company_id: companyId, ...values })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  };
}
