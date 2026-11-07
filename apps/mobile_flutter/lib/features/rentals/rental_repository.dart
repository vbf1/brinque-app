import 'package:supabase_flutter/supabase_flutter.dart';

import 'rental_domain.dart';

/// Dedicated, company-scoped data access for the rebuilt Flutter rental module.
/// RLS remains the authorization boundary; every query also carries companyId.
class RentalRepository {
  RentalRepository({
    required SupabaseClient client,
    required this.companyId,
  }) : _client = client;

  final SupabaseClient _client;
  final String companyId;

  Future<List<Map<String, dynamic>>> fetchRentals() async {
    final rows = await _client.from('rentals').select(
      '*, customers(name), '
      'rental_items(id, product_id, quantity, unit_price, subtotal, '
      'products(name), rental_item_units(product_unit_id, product_units(asset_code))), '
      'rental_responsibles(user_id, employee_name_snapshot)',
    ).eq('company_id', companyId).order('start_date');
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<List<Map<String, dynamic>>> fetchCustomers() async {
    final rows = await _client.from('customers')
        .select('id, company_id, name, phone, email, address, notes, created_at, updated_at')
        .eq('company_id', companyId).order('name');
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<List<Map<String, dynamic>>> fetchProducts() async {
    final rows = await _client.from('products')
        .select('id, company_id, name, description, inventory_mode, total_quantity, daily_price, active, notes')
        .eq('company_id', companyId).eq('active', true).order('name');
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<List<Map<String, dynamic>>> fetchCompanyMembers() async {
    final members = await _client.from('company_members')
        .select('user_id, role').eq('company_id', companyId).order('created_at');
    final rows = List<Map<String, dynamic>>.from(members);
    if (rows.isEmpty) return [];
    final ids = rows.map((row) => row['user_id'] as String).toList();
    final profiles = await _client.from('profiles')
        .select('id, full_name').inFilter('id', ids);
    final names = {
      for (final profile in profiles)
        profile['id'] as String: profile['full_name'] as String? ?? 'Funcionário',
    };
    return rows.map((row) => {...row, 'name': names[row['user_id']] ?? 'Funcionário'}).toList();
  }

  Future<String> createRentalWithItems({
    required String customerId,
    required String startDate,
    required String endDate,
    required String startTime,
    required String endTime,
    required String status,
    required String deliveryMethod,
    required num totalAmount,
    required List<Map<String, dynamic>> items,
    String? deliveryAddress,
    List<String> responsibleUserIds = const [],
  }) async {
    validateRentalDraft(
      customerId: customerId, startDate: startDate, endDate: endDate,
      startTime: startTime, endTime: endTime, status: status,
      deliveryMethod: deliveryMethod, totalAmount: totalAmount,
      items: items, deliveryAddress: deliveryAddress,
    );
    if (!const {'pending', 'confirmed', 'ongoing'}.contains(status)) {
      throw ArgumentError('Uma nova locação só pode ser criada como pendente, confirmada ou em andamento.');
    }
    final result = await _client.rpc('create_rental_with_items', params: {
      'p_company_id': companyId,
      'p_customer_id': customerId,
      'p_start_date': startDate,
      'p_end_date': endDate,
      'p_start_time': startTime,
      'p_end_time': endTime,
      'p_status': status,
      'p_delivery_method': deliveryMethod,
      'p_total_amount': totalAmount,
      'p_items': items,
      'p_delivery_address': deliveryAddress,
      'p_responsible_user_ids': responsibleUserIds,
    });
    return result as String;
  }

  Future<void> updateRentalWithItems({
    required String rentalId,
    required String customerId,
    required String startDate,
    required String endDate,
    required String startTime,
    required String endTime,
    required String status,
    required String deliveryMethod,
    required num totalAmount,
    required List<Map<String, dynamic>> items,
    String? deliveryAddress,
    List<String> responsibleUserIds = const [],
  }) async {
    validateRentalDraft(
      customerId: customerId, startDate: startDate, endDate: endDate,
      startTime: startTime, endTime: endTime, status: status,
      deliveryMethod: deliveryMethod, totalAmount: totalAmount,
      items: items, deliveryAddress: deliveryAddress,
    );
    await _client.rpc('update_rental_with_items', params: {
      'p_company_id': companyId,
      'p_rental_id': rentalId,
      'p_customer_id': customerId,
      'p_start_date': startDate,
      'p_end_date': endDate,
      'p_start_time': startTime,
      'p_end_time': endTime,
      'p_status': status,
      'p_delivery_method': deliveryMethod,
      'p_total_amount': totalAmount,
      'p_items': items,
      'p_delivery_address': deliveryAddress,
      'p_responsible_user_ids': responsibleUserIds,
    });
  }

  Future<void> deleteRental(String rentalId) async {
    final result = await _client.from('rentals').delete()
        .eq('id', rentalId).eq('company_id', companyId)
        .select('id').maybeSingle();
    if (result == null) {
      throw StateError('A locação não foi encontrada ou você não tem permissão para excluí-la.');
    }
  }
}
