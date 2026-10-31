import 'dart:math';

/// Roles in a shop and what each can do (`domain/team.ts`, mirrored from
/// `capabilitiesForVendorRole` on the server).
enum VendorRole {
  owner('owner', 'Owner', 'Everything, including shop settings and the team.'),
  manager('manager', 'Manager', "Orders and products. Can remove a customer's details on request."),
  staff('staff', 'Staff', 'Orders only.');

  const VendorRole(this.wire, this.label, this.summary);

  final String wire;
  final String label;
  final String summary;

  static VendorRole parse(String value) => VendorRole.values.firstWhere(
    (role) => role.wire == value,
    orElse: () => throw FormatException('Unknown role "$value".'),
  );

  /// Roles an owner can give from Team; owners are managed by Chapega.
  static const assignable = [manager, staff];
}

// No look-alikes (0/o, 1/l/i), so a password read aloud or copied by hand works.
const _alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
const _groups = 4;
const _groupLength = 5;

/// A random temporary password such as "k7mqp-2xwhe-9tzrd-c4nfa" (20 random
/// characters, about 99 bits). The person replaces it at their first sign-in.
String generateTemporaryPassword([Random? random]) {
  final source = random ?? Random.secure();
  // Rejection sampling keeps every character equally likely.
  final limit = 256 - (256 % _alphabet.length);
  final characters = <String>[];
  while (characters.length < _groups * _groupLength) {
    final byte = source.nextInt(256);
    if (byte < limit) characters.add(_alphabet[byte % _alphabet.length]);
  }
  return [
    for (var group = 0; group < _groups; group++)
      characters.sublist(group * _groupLength, (group + 1) * _groupLength).join(),
  ].join('-');
}
