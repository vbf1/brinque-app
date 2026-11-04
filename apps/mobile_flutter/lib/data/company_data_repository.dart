import 'package:supabase_flutter/supabase_flutter.dart';

/// Company-scoped access to the existing KidsLoc data model.
///
/// Every query is explicitly filtered by [companyId]. Authorization remains
/// enforced by Supabase RLS; this client-side filter is not a security boundary.
class CompanyDataRepository {
  CompanyDataRepository({
    required SupabaseClient client,
    required this.companyId,
  }) : _client = client;

  final SupabaseClient _client;
  final String companyId;

  Future<List<Map<String, dynamic>>> fetchCustomers() async {
    final rows = await _client
        .from('customers')
        .select('id, company_id, name, phone, email, address, notes, created_at, updated_at')
        .eq('company_id', companyId)
        .order('name');
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<List<Map<String, dynamic>>> fetchProducts() async {
    final rows = await _client
        .from('products')
        .select('id, company_id, name, description, inventory_mode, total_quantity, daily_price, active, notes')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('name');
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<List<Map<String, dynamic>>> fetchProductUnits() async {
    final rows = await _client
        .from('product_units')
        .select('id, company_id, product_id, asset_code, description, status')
        .eq('company_id', companyId)
        .order('asset_code');
    return List<Map<String, dynamic>>.from(rows);
  }

  /// Creates a rental and all selected toys in one database transaction.
  /// Stock validation and individual-unit allocation remain server-side.
  Future<String> createRentalWithItems({
    required String customerId,
    required String startDate,
    required String endDate,
    required String status,
    required String deliveryMethod,
    required num totalAmount,
    required List<Map<String, dynamic>> items,
    String? deliveryAddress,
    List<String> responsibleUserIds = const [],
  }) async {
    final result = await _client.rpc(
      'create_rental_with_items',
      params: {
        'p_company_id': companyId,
        'p_customer_id': customerId,
        'p_start_date': startDate,
        'p_end_date': endDate,
        'p_status': status,
        'p_delivery_method': deliveryMethod,
        'p_total_amount': totalAmount,
        'p_items': items,
        'p_delivery_address': deliveryAddress,
        'p_responsible_user_ids': responsibleUserIds,
      },
    );
    return result as String;
  }

  /// Replaces rental details and the full toy list atomically. Sending an empty
  /// list is rejected by the existing database function; callers must retain
  /// at least one toy in every rental.
  Future<void> updateRentalWithItems({
    required String rentalId,
    required String customerId,
    required String startDate,
    required String endDate,
    required String status,
    required String deliveryMethod,
    required num totalAmount,
    required List<Map<String, dynamic>> items,
    String? deliveryAddress,
    List<String> responsibleUserIds = const [],
  }) async {
    await _client.rpc(
      'update_rental_with_items',
      params: {
        'p_company_id': companyId,
        'p_rental_id': rentalId,
        'p_customer_id': customerId,
        'p_start_date': startDate,
        'p_end_date': endDate,
        'p_status': status,
        'p_delivery_method': deliveryMethod,
        'p_total_amount': totalAmount,
        'p_items': items,
        'p_delivery_address': deliveryAddress,
        'p_responsible_user_ids': responsibleUserIds,
      },
    );
  }

  /// Loads rentals and their selected toys using the same relations consumed
  /// by the currently deployed application.
  Future<List<Map<String, dynamic>>> fetchRentals() async {
    final rows = await _client
        .from('rentals')
        .select(
          '*, customers(name), '
          'rental_items(id, product_id, quantity, unit_price, subtotal, '
          'products(name), rental_item_units(product_unit_id, product_units(asset_code)))',
        )
        .eq('company_id', companyId)
        .order('start_date');
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<Map<String, dynamic>> saveCustomer({
    String? customerId,
    required String name,
    String? phone,
    String? email,
    String? address,
    String? notes,
  }) async {
    final normalizedName = name.trim();
    if (normalizedName.isEmpty) {
      throw ArgumentError.value(name, 'name', 'Informe o nome do cliente.');
    }

    final values = <String, dynamic>{
      'name': normalizedName,
      'phone': _nullableTrim(phone),
      'email': _nullableTrim(email),
      'address': _nullableTrim(address),
      'notes': _nullableTrim(notes),
    };

    if (customerId == null) {
      final row = await _client
          .from('customers')
          .insert({'company_id': companyId, ...values})
          .select()
          .single();
      return Map<String, dynamic>.from(row);
    }

    final row = await _client
        .from('customers')
        .update(values)
        .eq('id', customerId)
        .eq('company_id', companyId)
        .select()
        .single();
    return Map<String, dynamic>.from(row);
  }

  static String? _nullableTrim(String? value) {
    final normalized = value?.trim();
    return normalized == null || normalized.isEmpty ? null : normalized;
  }
}
