/// Shared wall-clock rental boundary rules used by Flutter inventory and rentals.
DateTime? rentalBoundary(
  dynamic rawDate,
  dynamic rawTime, {
  required bool isEnd,
}) {
  final date = DateTime.tryParse(rawDate?.toString() ?? '');
  if (date == null) return null;
  final day = DateTime(date.year, date.month, date.day);
  final raw = rawTime?.toString();
  if (raw == null || raw.isEmpty) {
    return isEnd ? day.add(const Duration(days: 1)) : day;
  }
  final match = RegExp(r'^(\d{2}):(\d{2})').firstMatch(raw);
  if (match == null) return null;
  final hour = int.tryParse(match.group(1)!);
  final minute = int.tryParse(match.group(2)!);
  if (hour == null || minute == null || hour < 0 || hour > 24 ||
      minute < 0 || minute > 59 || (hour == 24 && minute != 0)) {
    return null;
  }
  return hour == 24
      ? day.add(const Duration(days: 1))
      : day.add(Duration(hours: hour, minutes: minute));
}

String normalizeRentalTime(dynamic value, String fallback) {
  final raw = value?.toString() ?? '';
  return raw.length >= 5 && RegExp(r'^\d{2}:\d{2}').hasMatch(raw)
      ? raw.substring(0, 5)
      : fallback;
}

bool isValidRentalTimeRange({
  required DateTime startDate,
  required DateTime endDate,
  required String startTime,
  required String endTime,
}) {
  final startDay = DateTime(startDate.year, startDate.month, startDate.day);
  final endDay = DateTime(endDate.year, endDate.month, endDate.day);
  if (endDay.isBefore(startDay)) return false;
  if (startDay != endDay) return true;
  final startParts = startTime.split(':');
  final endParts = endTime.split(':');
  final startMinutes = (int.tryParse(startParts.first) ?? -1) * 60 +
      (int.tryParse(startParts.length > 1 ? startParts[1] : '') ?? -1);
  final endMinutes = (int.tryParse(endParts.first) ?? -1) * 60 +
      (int.tryParse(endParts.length > 1 ? endParts[1] : '') ?? -1);
  return startMinutes >= 0 && endMinutes > startMinutes && endMinutes <= 1440;
}
