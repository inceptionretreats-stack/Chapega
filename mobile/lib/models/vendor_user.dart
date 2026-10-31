import 'package:flutter/foundation.dart';

import '../core/json.dart';
import '../domain/team.dart';

/// A shop as the API identifies it (`VendorIdentity` in types/vendor.ts).
@immutable
class VendorIdentity {
  const VendorIdentity({
    required this.id,
    required this.slug,
    required this.displayName,
    required this.active,
  });

  factory VendorIdentity.fromJson(JsonMap json) => VendorIdentity(
    id: json.str('id'),
    slug: json.str('slug'),
    displayName: json.str('displayName'),
    active: json.str('status') == 'active',
  );

  final String id;
  final String slug;
  final String displayName;

  /// False when Chapega has suspended the shop.
  final bool active;

  VendorIdentity copyWith({String? displayName}) => VendorIdentity(
    id: id,
    slug: slug,
    displayName: displayName ?? this.displayName,
    active: active,
  );
}

@immutable
class VendorMembership {
  const VendorMembership({
    required this.vendor,
    required this.role,
    required this.active,
    required this.isDefault,
  });

  factory VendorMembership.fromJson(JsonMap json) => VendorMembership(
    vendor: VendorIdentity.fromJson(json.obj('vendor')),
    role: VendorRole.parse(json.str('role')),
    active: json.boolean('active'),
    isDefault: json.boolean('isDefault'),
  );

  final VendorIdentity vendor;
  final VendorRole role;
  final bool active;
  final bool isDefault;

  /// A shop this person can open now.
  bool get usable => active && vendor.active;
}

/// What the person may do in the active shop. The server checks every write
/// again; the app uses these only to hide what would be refused.
@immutable
class VendorCapabilities {
  const VendorCapabilities({
    required this.viewDashboard,
    required this.manageOrders,
    required this.manageCatalogue,
    required this.manageSettings,
    required this.manageTeam,
    required this.eraseCustomerData,
  });

  factory VendorCapabilities.fromJson(JsonMap json) => VendorCapabilities(
    viewDashboard: json.optBool('view_dashboard'),
    manageOrders: json.optBool('manage_orders'),
    manageCatalogue: json.optBool('manage_catalogue'),
    manageSettings: json.optBool('manage_settings'),
    manageTeam: json.optBool('manage_team'),
    eraseCustomerData: json.optBool('erase_customer_data'),
  );

  /// Mirrors `capabilitiesForVendorRole` in server/vendor/auth.ts.
  factory VendorCapabilities.forRole(VendorRole role) => VendorCapabilities(
    viewDashboard: true,
    manageOrders: true,
    manageCatalogue: role != VendorRole.staff,
    manageSettings: role == VendorRole.owner,
    manageTeam: role == VendorRole.owner,
    eraseCustomerData: role != VendorRole.staff,
  );

  final bool viewDashboard;
  final bool manageOrders;
  final bool manageCatalogue;
  final bool manageSettings;
  final bool manageTeam;
  final bool eraseCustomerData;

  @override
  bool operator ==(Object other) =>
      other is VendorCapabilities &&
      other.viewDashboard == viewDashboard &&
      other.manageOrders == manageOrders &&
      other.manageCatalogue == manageCatalogue &&
      other.manageSettings == manageSettings &&
      other.manageTeam == manageTeam &&
      other.eraseCustomerData == eraseCustomerData;

  @override
  int get hashCode => Object.hash(
    viewDashboard,
    manageOrders,
    manageCatalogue,
    manageSettings,
    manageTeam,
    eraseCustomerData,
  );
}

/// The signed-in person (`VendorUser` in types/vendor.ts).
@immutable
class VendorUser {
  const VendorUser({
    required this.id,
    required this.email,
    required this.name,
    required this.isPlatformAdmin,
    required this.role,
    required this.activeVendor,
    required this.memberships,
    required this.capabilities,
    required this.mustChangePassword,
  });

  factory VendorUser.fromJson(JsonMap json) => VendorUser(
    id: json.str('id'),
    email: json.str('email'),
    name: json.str('name'),
    isPlatformAdmin: json.optStr('platformRole') == 'super_admin',
    role: VendorRole.parse(json.str('role')),
    activeVendor: VendorIdentity.fromJson(json.obj('activeVendor')),
    memberships: json.list('memberships', VendorMembership.fromJson),
    capabilities: VendorCapabilities.fromJson(json.obj('capabilities')),
    mustChangePassword: json.optBool('mustChangePassword'),
  );

  final String id;
  final String email;
  final String name;
  final bool isPlatformAdmin;

  /// The role in [activeVendor].
  final VendorRole role;
  final VendorIdentity activeVendor;
  final List<VendorMembership> memberships;
  final VendorCapabilities capabilities;

  /// Signed in with a temporary password someone else chose; nothing else
  /// works until it is replaced.
  final bool mustChangePassword;

  /// Shops the person can open now, default first.
  List<VendorMembership> get usableShops {
    final usable = memberships.where((membership) => membership.usable).toList();
    usable.sort((a, b) {
      if (a.isDefault != b.isDefault) return a.isDefault ? -1 : 1;
      return a.vendor.displayName.toLowerCase().compareTo(b.vendor.displayName.toLowerCase());
    });
    return usable;
  }

  VendorMembership? membershipFor(String slug) {
    for (final membership in memberships) {
      if (membership.vendor.slug == slug) return membership;
    }
    return null;
  }
}
