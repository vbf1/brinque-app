/// Pure domain validation shared by the Flutter rental create/edit flow.
/// Database RPCs remain authoritative for authorization and stock concurrency.
void validateRentalDraft({
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
}) {
  if (customerId.trim().isEmpty) {
    throw ArgumentError('Selecione um cliente.');
  }

  DateTime? parseDate(String value) {
    final match = RegExp(r'^([0-9]{4})-([0-9]{2})-([0-9]{2})$').firstMatch(value);
    if (match == null) return null;
    final year = int.parse(match.group(1)!);
    final month = int.parse(match.group(2)!);
    final day = int.parse(match.group(3)!);
    final date = DateTime.utc(year, month, day);
    if (date.year != year || date.month != month || date.day != day) return null;
    return date;
  }

  final start = parseDate(startDate);
  final end = parseDate(endDate);
  if (start == null || end == null || end.isBefore(start)) {
    throw ArgumentError('Informe um período válido para a locação.');
  }

  int? parseTime(String value) {
    final match = RegExp(r'^([01][0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?$').firstMatch(value);
    if (match == null) return null;
    return int.parse(match.group(1)!) * 3600 +
        int.parse(match.group(2)!) * 60 +
        int.parse(match.group(3) ?? '0');
  }

  final startSeconds = parseTime(startTime);
  final endSeconds = parseTime(endTime);
  if (startSeconds == null || endSeconds == null) {
    throw ArgumentError('Informe horários válidos para a locação.');
  }
  if (startDate == endDate && endSeconds <= startSeconds) {
    throw ArgumentError('O horário de término precisa ser posterior ao início.');
  }
  if (!const {'pending', 'confirmed', 'ongoing', 'completed', 'cancelled'}.contains(status)) {
    throw ArgumentError('Status de locação inválido.');
  }
  if (!const {'delivery', 'customer_pickup'}.contains(deliveryMethod)) {
    throw ArgumentError('Selecione uma modalidade de entrega válida.');
  }
  if (deliveryMethod == 'delivery' && (deliveryAddress == null || deliveryAddress.trim().isEmpty)) {
    throw ArgumentError('Informe o endereço de entrega.');
  }
  if (!totalAmount.isFinite || totalAmount < 0) {
    throw ArgumentError('Informe um valor total válido.');
  }
  if (items.isEmpty) {
    throw ArgumentError('Adicione pelo menos um brinquedo à locação.');
  }

  final productIds = <String>{};
  for (final item in items) {
    final productId = item['product_id']?.toString().trim() ?? '';
    if (productId.isEmpty) throw ArgumentError('Selecione todos os brinquedos.');
    if (!productIds.add(productId)) {
      throw ArgumentError('Cada brinquedo deve aparecer apenas uma vez; ajuste a quantidade no próprio item.');
    }
    final quantity = item['quantity'];
    if (quantity is! int || quantity < 1) {
      throw ArgumentError('A quantidade de cada brinquedo deve ser um número inteiro maior que zero.');
    }
    final price = item['unit_price'];
    if (price is! num || !price.isFinite || price < 0) {
      throw ArgumentError('O preço unitário de cada brinquedo deve ser zero ou maior.');
    }
  }
}
