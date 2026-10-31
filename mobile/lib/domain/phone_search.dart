/// Customers read their number back in any format ("+91 98765 43210"), so
/// order search compares digits only (`components/vendor/vendor-orders.tsx`).
bool phoneMatches(String phone, String query) {
  final queryDigits = query.replaceAll(RegExp(r'\D'), '');
  final phoneDigits = phone.replaceAll(RegExp(r'\D'), '');
  if (queryDigits.length < 4 || phoneDigits.length < 7) return false;
  return phoneDigits.contains(queryDigits) || queryDigits.endsWith(phoneDigits);
}
