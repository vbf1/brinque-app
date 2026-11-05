import 'package:flutter_test/flutter_test.dart';
import 'package:kidsloc_mobile/data/rental_time.dart';

void main() {
  group('rentalBoundary', () {
    test('uses the full day when legacy rentals have no times', () {
      expect(
        rentalBoundary('2026-11-05', null, isEnd: false),
        DateTime(2026, 11, 5),
      );
      expect(
        rentalBoundary('2026-11-05', null, isEnd: true),
        DateTime(2026, 11, 6),
      );
    });

    test('uses the configured wall-clock time', () {
      expect(
        rentalBoundary('2026-11-05', '09:30:00', isEnd: false),
        DateTime(2026, 11, 5, 9, 30),
      );
      expect(
        rentalBoundary('2026-11-05', '24:00:00', isEnd: true),
        DateTime(2026, 11, 6),
      );
    });

    test('rejects malformed time values', () {
      expect(rentalBoundary('2026-11-05', 'not-a-time', isEnd: false), isNull);
      expect(rentalBoundary('invalid-date', '09:00', isEnd: false), isNull);
    });
  });

  group('rental time range validation', () {
    test('requires a later end time on the same day', () {
      final date = DateTime(2026, 11, 5);
      expect(isValidRentalTimeRange(
        startDate: date,
        endDate: date,
        startTime: '09:00',
        endTime: '09:00',
      ), isFalse);
      expect(isValidRentalTimeRange(
        startDate: date,
        endDate: date,
        startTime: '09:00',
        endTime: '17:00',
      ), isTrue);
    });

    test('allows rentals that finish on a later day', () {
      expect(isValidRentalTimeRange(
        startDate: DateTime(2026, 11, 5),
        endDate: DateTime(2026, 11, 6),
        startTime: '18:00',
        endTime: '08:00',
      ), isTrue);
    });
  });

  test('normalizes database time values for the time picker', () {
    expect(normalizeRentalTime('09:30:00', '00:00'), '09:30');
    expect(normalizeRentalTime(null, '00:00'), '00:00');
    expect(normalizeRentalTime('invalid', '00:00'), '00:00');
  });
}
