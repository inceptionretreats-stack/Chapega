/// Date wording used by the web Studio (`components/vendor/vendor-shared.tsx`),
/// in the phone's local time zone.
library;

const _monthsShort = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const _monthsLong = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const _weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

String _time(DateTime local) {
  final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
  final minute = local.minute.toString().padLeft(2, '0');
  return '$hour:$minute ${local.hour < 12 ? 'am' : 'pm'}';
}

/// "31 Oct, 11:24 am".
String formatVendorDate(DateTime value) {
  final local = value.toLocal();
  return '${local.day} ${_monthsShort[local.month - 1]}, ${_time(local)}';
}

/// "31 Oct 2026".
String formatShortDate(DateTime value) {
  final local = value.toLocal();
  return '${local.day} ${_monthsShort[local.month - 1]} ${local.year}';
}

/// "Saturday, 31 October".
String formatDayHeading(DateTime value) {
  final local = value.toLocal();
  return '${_weekdays[local.weekday - 1]}, ${local.day} ${_monthsLong[local.month - 1]}';
}

/// "Just now", "5 min ago", "1 hr ago", "2 hrs ago", "3 days ago".
String relativeVendorTime(DateTime value, DateTime now) {
  final minutes = now.difference(value).inMinutes;
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return '$minutes min ago';
  final hours = minutes ~/ 60;
  if (hours < 24) return '$hours hr${hours == 1 ? '' : 's'} ago';
  final days = hours ~/ 24;
  return '$days day${days == 1 ? '' : 's'} ago';
}

/// Whether [value] falls on the same local calendar day as [now].
bool isSameLocalDay(DateTime value, DateTime now) {
  final a = value.toLocal();
  final b = now.toLocal();
  return a.year == b.year && a.month == b.month && a.day == b.day;
}
