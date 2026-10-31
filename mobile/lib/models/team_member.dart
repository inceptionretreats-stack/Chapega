import 'package:flutter/foundation.dart';

import '../core/json.dart';
import '../domain/team.dart';

/// One person on a shop's team (`VendorTeamMember`).
@immutable
class TeamMember {
  const TeamMember({
    required this.userId,
    required this.name,
    required this.email,
    required this.role,
    required this.active,
    required this.passwordChangePending,
    required this.isCurrentUser,
    required this.canManage,
    required this.canResetPassword,
    required this.memberSince,
  });

  factory TeamMember.fromJson(JsonMap json) => TeamMember(
    userId: json.str('userId'),
    name: json.str('name'),
    email: json.str('email'),
    role: VendorRole.parse(json.str('role')),
    active: json.boolean('active'),
    passwordChangePending: json.boolean('passwordChangePending'),
    isCurrentUser: json.boolean('isCurrentUser'),
    canManage: json.boolean('canManage'),
    canResetPassword: json.boolean('canResetPassword'),
    memberSince: json.date('memberSince'),
  );

  final String userId;
  final String name;
  final String email;
  final VendorRole role;

  /// Has access to this shop.
  final bool active;

  /// Still has to replace a temporary password.
  final bool passwordChangePending;
  final bool isCurrentUser;

  /// Role and access can be changed (not an owner, not yourself).
  final bool canManage;

  /// A temporary password can be set (this shop's account only).
  final bool canResetPassword;
  final DateTime memberSince;

  /// "Active", "Waiting for their own password" or "No access".
  String get stateLabel {
    if (!active) return 'No access';
    if (passwordChangePending) return 'Waiting for their own password';
    return 'Active';
  }
}
