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

  Future<List<Map<String, dynamic>>> fetchTransactions() async {
    final rows = await _client.from('financial_transactions')
        .select('id, company_id, transaction_type, description, amount, status, paid_at, created_at')
        .eq('company_id', companyId).order('created_at', ascending: false);
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<void> saveTransaction({
    String? id,
    required String type,
    required String description,
    required num amount,
  }) async {
    final cleanDescription = description.trim();
    if (cleanDescription.isEmpty || amount <= 0) {
      throw ArgumentError('Informe descrição e um valor maior que zero.');
    }
    final values = {
      'transaction_type': type,
      'description': cleanDescription,
      'amount': amount,
    };
    if (id != null) {
      await _client.from('financial_transactions').update(values)
          .eq('id', id).eq('company_id', companyId);
    } else {
      await _client.from('financial_transactions').insert({
        'company_id': companyId,
        ...values,
        'status': 'paid',
        'paid_at': DateTime.now().toIso8601String().substring(0, 10),
      });
    }
  }

  Future<void> deleteTransaction(String id) async {
    await _client.from('financial_transactions').delete()
        .eq('id', id).eq('company_id', companyId);
  }

  Future<List<Map<String, dynamic>>> fetchCustomers() async {
    final rows = await _client
        .from('customers')
        .select('id, company_id, name, phone, email, address, notes, created_at, updated_at')
        .eq('company_id', companyId)
        .order('name');
    return List<Map<String, dynamic>>.from(rows);
  }


  Future<List<Map<String, dynamic>>> fetchCompanyMembers() async {
    final members = await _client
        .from('company_members')
        .select('user_id, role')
        .eq('company_id', companyId)
        .order('created_at');
    final rows = List<Map<String, dynamic>>.from(members);
    if (rows.isEmpty) return [];
    final ids = rows.map((row) => row['user_id'] as String).toList();
    final profiles = await _client
        .from('profiles')
        .select('id, full_name')
        .inFilter('id', ids);
    final names = {
      for (final profile in profiles)
        profile['id'] as String: profile['full_name'] as String? ?? 'Funcionário',
    };
    return rows.map((row) => {
      ...row,
      'name': names[row['user_id']] ?? 'Funcionário',
    }).toList();
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
  Future<void> setProductUnitStatus(String unitId, String status) async {
    final unit = await _client.from('product_units').select('id, product_id, status')
        .eq('id', unitId).eq('company_id', companyId).single();
    if (status == 'maintenance') {
      await _client.from('maintenance_records').insert({
        'company_id': companyId, 'product_id': unit['product_id'],
        'product_unit_id': unit['id'],
        'description': 'Unidade enviada para manutenção pelo controle de estoque.',
        'status': 'open',
      });
    } else if (unit['status'] == 'maintenance') {
      await _client.from('maintenance_records').update({
        'status': 'completed',
        'completed_at': DateTime.now().toIso8601String().substring(0, 10),
      }).eq('product_unit_id', unitId).eq('company_id', companyId).eq('status', 'open');
    }
    final updated = await _client.from('product_units').update({'status': status})
        .eq('id', unitId).eq('company_id', companyId).select('id').maybeSingle();
    if (updated == null) throw StateError('Unidade não encontrada ou sem permissão para atualizar.');
  }

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
          'products(name), rental_item_units(product_unit_id, product_units(asset_code)), '
          'rental_responsibles(user_id, employee_name_snapshot))',
        )
        .eq('company_id', companyId)
        .order('start_date');
    return List<Map<String, dynamic>>.from(rows);
  }



  Future<void> deleteRental(String rentalId) async {
    final result = await _client.from('rentals')
        .delete()
        .eq('id', rentalId)
        .eq('company_id', companyId)
        .select('id')
        .maybeSingle();
    if (result == null) {
      throw StateError('A locação não foi encontrada ou você não tem permissão para excluí-la.');
    }
  }

  Future<Map<String, dynamic>> saveProduct({
    String? productId,
    required String name,
    required String inventoryMode,
    required int quantity,
    required num dailyPrice,
  }) async {
    final normalizedName = name.trim();
    if (normalizedName.isEmpty || quantity < 1 || dailyPrice < 0) {
      throw ArgumentError('Confira o nome, a quantidade e o preço diário.');
    }
    if (productId == null) {
      final created = await _client.from('products').insert({
        'company_id': companyId,
        'name': normalizedName,
        'inventory_mode': inventoryMode,
        'total_quantity': quantity,
        'daily_price': dailyPrice,
      }).select().single();
      if (inventoryMode == 'individual') {
        try {
          await _client.from('product_units').insert(List.generate(
            quantity,
            (index) => {
              'company_id': companyId,
              'product_id': created['id'],
              'asset_code': (index + 1).toString().padLeft(2, '0'),
              'status': 'available',
            },
          ));
        } catch (_) {
          await _client.from('products').delete()
              .eq('id', created['id']).eq('company_id', companyId);
          rethrow;
        }
      }
      return Map<String, dynamic>.from(created);
    }

    final existing = await _client.from('products').select(
      'id, inventory_mode, total_quantity',
    ).eq('id', productId).eq('company_id', companyId).single();
    if (existing['inventory_mode'] == 'individual') {
      final units = await _client.from('product_units').select(
        'id, asset_code, status',
      ).eq('product_id', productId).eq('company_id', companyId);
      final current = List<Map<String, dynamic>>.from(units);
      if (quantity < current.length) {
        final removable = current.where((unit) =>
          unit['status'] == 'available').toList();
        final excess = current.length - quantity;
        if (removable.length < excess) {
          throw StateError('Não é possível reduzir: existem unidades reservadas, em manutenção ou indisponíveis.');
        }
        final rentalUnits = await _client.from('rental_item_units')
          .select('product_unit_id')
          .inFilter('product_unit_id', removable.map((u) => u['id']).toList());
        final usedIds = List<Map<String, dynamic>>.from(rentalUnits)
          .map((row) => row['product_unit_id']).toSet();
        final safe = removable.where((u) => !usedIds.contains(u['id'])).toList();
        if (safe.length < excess) {
          throw StateError('Não é possível excluir unidades que possuem histórico de locação.');
        }
        final ids = safe.take(excess).map((u) => u['id']).toList();
        await _client.from('product_units').delete()
          .eq('company_id', companyId).inFilter('id', ids);
      } else if (quantity > current.length) {
        final maxCode = current.fold<int>(0, (max, unit) {
          final parsed = int.tryParse(unit['asset_code']?.toString() ?? '') ?? 0;
          return parsed > max ? parsed : max;
        });
        await _client.from('product_units').insert(List.generate(
          quantity - current.length,
          (index) => {
            'company_id': companyId,
            'product_id': productId,
            'asset_code': (maxCode + index + 1).toString().padLeft(2, '0'),
            'status': 'available',
          },
        ));
      }
    } else if (existing['inventory_mode'] != inventoryMode) {
      throw StateError('O tipo de controle do estoque não pode ser alterado após o cadastro.');
    }

    final updated = await _client.from('products').update({
      'name': normalizedName,
      'total_quantity': quantity,
      'daily_price': dailyPrice,
    }).eq('id', productId).eq('company_id', companyId).select().single();
    return Map<String, dynamic>.from(updated);
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
