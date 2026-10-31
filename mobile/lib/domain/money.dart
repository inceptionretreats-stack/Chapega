/// Money rules shared with the web app (`domain/money.ts`): amounts are whole
/// paise, shown as rupees with Indian digit grouping ("₹12,34,567.89").
library;

/// The largest price the server accepts: ₹10,00,000 (`server/vendor/schemas.ts`).
const int maxPricePaise = 100000000;

/// The largest stock the server accepts for a product or an option.
const int maxStock = 100000;

/// "₹1,234.56". Throws [RangeError] for negative amounts, as the web does.
String formatInr(int paise) {
  if (paise < 0) {
    throw RangeError('Amount must be a non-negative integer in paise.');
  }
  final rupees = paise ~/ 100;
  final fraction = (paise % 100).toString().padLeft(2, '0');
  return '₹${groupIndianDigits(rupees)}.$fraction';
}

/// 1234567 → "12,34,567": the last three digits, then groups of two.
String groupIndianDigits(int value) {
  final digits = value.abs().toString();
  final sign = value < 0 ? '-' : '';
  if (digits.length <= 3) return '$sign$digits';
  final lastThree = digits.substring(digits.length - 3);
  var rest = digits.substring(0, digits.length - 3);
  final groups = <String>[];
  while (rest.length > 2) {
    groups.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) groups.insert(0, rest);
  return '$sign${groups.join(',')},$lastThree';
}

/// JavaScript's `Math.round(value * 100)`: halves round up, also for
/// negative numbers, so prices typed in the app match the web exactly.
int _jsRoundToPaise(double rupees) => (rupees * 100 + 0.5).floor();

double? _parseNumber(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return null;
  final number = double.tryParse(trimmed);
  return number != null && number.isFinite ? number : null;
}

/// A rupee amount typed by the shop ("499" or "499.50") in paise, or null
/// when it is blank, not a number, negative or above [maxPricePaise].
int? rupeesToPaise(String value) {
  final number = _parseNumber(value);
  if (number == null) return null;
  final paise = _jsRoundToPaise(number);
  return paise >= 0 && paise <= maxPricePaise ? paise : null;
}

/// Like [rupeesToPaise] but allows a minus sign (option price adjustments).
int? signedRupeesToPaise(String value) {
  final number = _parseNumber(value);
  if (number == null) return null;
  final paise = _jsRoundToPaise(number);
  return paise.abs() <= maxPricePaise ? paise : null;
}

/// Paise as the plain rupee text an input field shows: 49900 → "499",
/// 49950 → "499.5" (the web's `String(paise / 100)`).
String paiseToRupeeInput(int paise) {
  if (paise % 100 == 0) return (paise ~/ 100).toString();
  final text = (paise / 100).toStringAsFixed(2);
  return text.endsWith('0') ? text.substring(0, text.length - 1) : text;
}
