import 'package:flutter_test/flutter_test.dart';
import 'package:kidsloc/features/rentals/rental_domain.dart';

void main() {
  final valid = <String, dynamic>{
    'customerId': 'customer-1',
    'startDate': '2026-11-10',
    'endDate': '2026-11-10',
    'startTime': '09:00',
    'endTime': '17:00',
    'status': 'pending',
    'deliveryMethod': 'customer_pickup',
    'totalAmount': 150,
    'items': [
      {'product_id': 'toy-1', 'quantity': 2, 'unit_price': 75},
    ],
  };

  void validate(Map<String, dynamic> value) => validateRentalDraft(
    customerId: value['customerId'] as String,
    startDate: value['startDate'] as String,
    endDate: value['endDate'] as String,
    startTime: value['startTime'] as String,
    endTime: value['endTime'] as String,
    status: value['status'] as String,
    deliveryMethod: value['deliveryMethod'] as String,
    totalAmount: value['totalAmount'] as num,
    items: (value['items'] as List).cast<Map<String, dynamic>>(),
    deliveryAddress: value['deliveryAddress'] as String?,
  );

  test('accepts a valid rental draft', () {
    expect(() => validate(valid), returnsNormally);
  });

  test('rejects missing customer', () {
    expect(() => validate({...valid, 'customerId': ' '}), throwsArgumentError);
  });

  test('rejects impossible dates and reversed periods', () {
    expect(() => validate({...valid, 'startDate': '2026-02-30'}), throwsArgumentError);
    expect(() => validate({...valid, 'endDate': '2026-11-09'}), throwsArgumentError);
  });

  test('rejects end time equal to start time on same day', () {
    expect(() => validate({...valid, 'endTime': '09:00:00'}), throwsArgumentError);
  });

  test('requires delivery address for delivery method', () {
    expect(() => validate({...valid, 'deliveryMethod': 'delivery'}), throwsArgumentError);
  });

  test('rejects invalid status and delivery method', () {
    expect(() => validate({...valid, 'status': 'unknown'}), throwsArgumentError);
    expect(() => validate({...valid, 'deliveryMethod': 'courier'}), throwsArgumentError);
  });

  test('rejects empty or duplicated products', () {
    expect(() => validate({...valid, 'items': <Map<String, dynamic>>[]}), throwsArgumentError);
    expect(() => validate({...valid, 'items': [
      {'product_id': 'toy-1', 'quantity': 1, 'unit_price': 10},
      {'product_id': 'toy-1', 'quantity': 2, 'unit_price': 10},
    ]}), throwsArgumentError);
  });

  test('rejects invalid quantity and price', () {
    expect(() => validate({...valid, 'items': [
      {'product_id': 'toy-1', 'quantity': 0, 'unit_price': 10},
    ]}), throwsArgumentError);
    expect(() => validate({...valid, 'items': [
      {'product_id': 'toy-1', 'quantity': 1, 'unit_price': -1},
    ]}), throwsArgumentError);
  });
}
