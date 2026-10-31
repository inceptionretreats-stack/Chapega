import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:chapega_studio/core/api/api_failure.dart';
import 'package:chapega_studio/core/json.dart';
import 'package:chapega_studio/data/session_api.dart';
import 'package:chapega_studio/data/studio_api.dart';
import 'package:chapega_studio/domain/order_status.dart';
import 'package:chapega_studio/domain/team.dart';
import 'package:chapega_studio/models/app_session.dart';
import 'package:chapega_studio/models/studio_snapshot.dart';
import 'package:chapega_studio/models/team_member.dart';
import 'package:chapega_studio/models/vendor_order.dart';
import 'package:chapega_studio/models/vendor_product.dart';
import 'package:chapega_studio/models/vendor_settings.dart';
import 'package:chapega_studio/models/vendor_user.dart';

JsonMap fixtureJson(String name) =>
    jsonDecode(File('test/fixtures/$name').readAsStringSync()) as JsonMap;

/// The fixture user with another role (and capabilities to match).
JsonMap userJson({String role = 'owner', bool mustChangePassword = false, String? name}) {
  final user = fixtureJson('login_user.json');
  user['role'] = role;
  user['platformRole'] = null;
  if (name != null) user['name'] = name;
  if (mustChangePassword) user['mustChangePassword'] = true;
  user['capabilities'] = {
    'view_dashboard': true,
    'manage_orders': true,
    'manage_catalogue': role != 'staff',
    'manage_settings': role == 'owner',
    'manage_team': role == 'owner',
    'erase_customer_data': role != 'staff',
  };
  final membership = (user['memberships']! as List<Object?>).first! as JsonMap;
  membership['role'] = role;
  return user;
}

VendorUser fakeUser({String role = 'owner', bool mustChangePassword = false}) =>
    VendorUser.fromJson(userJson(role: role, mustChangePassword: mustChangePassword));

/// A test token built at run time (never a random-looking literal in source).
final testToken = 'chapega_app_${'t' * 43}';

class FakeSessionApi implements SessionApi {
  FakeSessionApi({VendorUser? user, this.currentFailure, this.signInFailure})
    : user = user ?? fakeUser();

  VendorUser user;
  ApiFailure? currentFailure;
  ApiFailure? signInFailure;
  bool pushServerEnabled = false;
  final List<String> calls = [];
  String? lastEmail;
  DeviceDetails? lastDevice;
  String? lastPushToken;

  @override
  Future<SignInResult> signIn({
    required String email,
    required String password,
    required DeviceDetails device,
    String? vendorSlug,
  }) async {
    calls.add('signIn');
    lastEmail = email;
    lastDevice = device;
    final failure = signInFailure;
    if (failure != null) throw failure;
    return SignInResult(
      token: testToken,
      user: user,
      expiresAt: null,
      absoluteExpiresAt: null,
      signedOutDevices: 0,
    );
  }

  @override
  Future<SessionStatus> current({bool background = false}) async {
    calls.add(background ? 'current:background' : 'current');
    final failure = currentFailure;
    if (failure != null) throw failure;
    return SessionStatus(
      user: user,
      expiresAt: null,
      absoluteExpiresAt: null,
      pushServerEnabled: pushServerEnabled,
    );
  }

  @override
  Future<void> signOut() async => calls.add('signOut');

  @override
  Future<bool> registerPushToken(String fcmToken) async {
    calls.add('registerPushToken');
    lastPushToken = fcmToken;
    return pushServerEnabled;
  }

  @override
  Future<void> removePushToken() async => calls.add('removePushToken');
}

HttpFailure conflict([
  String message = 'This changed in another session. Refresh before saving.',
]) => HttpFailure(status: 409, code: 'VERSION_CONFLICT', message: message);

/// An in-memory shop that behaves like the server for the calls the app
/// makes: versions are checked, saves bump them, stock moves on confirm.
class FakeStudioApi implements StudioApi {
  FakeStudioApi({this.slug = 'chapega', StudioSnapshot? snapshot, VendorUser? user})
    : snapshot = snapshot ?? StudioSnapshot.fromJson(_bootstrapFor(user));

  static JsonMap _bootstrapFor(VendorUser? user) {
    final json = fixtureJson('bootstrap.json');
    if (user != null) {
      final role = user.role.wire;
      json['user'] = userJson(role: role);
      json['capabilities'] = (json['user']! as JsonMap)['capabilities'];
    }
    return json;
  }

  @override
  final String slug;
  StudioSnapshot snapshot;
  ApiFailure? nextFailure;
  ApiFailure? bootstrapFailure;
  final List<String> calls = [];
  List<TeamMember> members = fixtureJson('team.json').list('members', TeamMember.fromJson);
  final List<Uint8List> uploads = [];

  void _fail() {
    final failure = nextFailure;
    if (failure != null) {
      nextFailure = null;
      throw failure;
    }
  }

  @override
  Future<StudioSnapshot> bootstrap({bool background = false}) async {
    calls.add(background ? 'bootstrap:background' : 'bootstrap');
    final failure = bootstrapFailure;
    if (failure != null) throw failure;
    return snapshot;
  }

  @override
  Future<VendorOrder> updateOrderStatus(String orderId, OrderStatus status, int version) async {
    calls.add('order:$orderId:${status.wire}');
    _fail();
    final order = snapshot.order(orderId)!;
    if (order.version != version) throw conflict();
    final json = _orderJson(order)
      ..['status'] = status.wire
      ..['version'] = version + 1
      ..['inventoryCommitted'] = status == OrderStatus.cancelled
          ? false
          : order.inventoryCommitted || status == OrderStatus.confirmed;
    final updated = VendorOrder.fromJson(json);
    snapshot = snapshot.copyWith(
      orders: [for (final o in snapshot.orders) o.id == orderId ? updated : o],
    );
    return updated;
  }

  @override
  Future<VendorOrder> removeCustomerDetails(String orderId, int version) async {
    calls.add('removeCustomer:$orderId');
    _fail();
    final order = snapshot.order(orderId)!;
    if (order.version != version) throw conflict();
    final json = _orderJson(order)
      ..['customer'] = {'customerName': '', 'customerPhone': '', 'giftNote': '', 'orderNote': ''}
      ..['whatsappMessage'] = "Customer details removed at the customer's request."
      ..['version'] = version + 1;
    final updated = VendorOrder.fromJson(json);
    snapshot = snapshot.copyWith(
      orders: [for (final o in snapshot.orders) o.id == orderId ? updated : o],
    );
    return updated;
  }

  JsonMap _orderJson(VendorOrder order) {
    final orders = fixtureJson('bootstrap.json')['orders']! as List<Object?>;
    final base = Map<String, Object?>.from(orders.first! as JsonMap);
    return base
      ..['id'] = order.id
      ..['orderNumber'] = order.orderNumber
      ..['status'] = order.status.wire
      ..['version'] = order.version
      ..['inventoryCommitted'] = order.inventoryCommitted
      ..['whatsappMessage'] = order.whatsappMessage
      ..['customer'] = {
        'customerName': order.customer.name,
        'customerPhone': order.customer.phone,
        'giftNote': order.customer.giftNote,
        'orderNote': order.customer.orderNote,
      };
  }

  VendorProduct _product(String id, ProductInput input, {int version = 1}) =>
      VendorProduct.fromJson({
        ...input.toJson(),
        'id': id,
        'availability': input.stock == 0 ? 'unavailable' : 'available',
        'archived': false,
        'version': version,
        'createdAt': DateTime.now().toUtc().toIso8601String(),
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
      });

  @override
  Future<VendorProduct> createProduct(ProductInput input) async {
    calls.add('createProduct');
    _fail();
    final product = _product(input.name.toLowerCase().replaceAll(RegExp('[^a-z0-9]+'), '-'), input);
    snapshot = snapshot.copyWith(products: [product, ...snapshot.products]);
    return product;
  }

  @override
  Future<VendorProduct> updateProduct(String productId, ProductInput input) async {
    calls.add('updateProduct:$productId');
    _fail();
    final current = snapshot.product(productId)!;
    if (input.version != current.version) throw conflict();
    final product = _product(productId, input, version: current.version + 1);
    snapshot = snapshot.copyWith(
      products: [for (final p in snapshot.products) p.id == productId ? product : p],
    );
    return product;
  }

  @override
  Future<void> archiveProduct(String productId, int version) async {
    calls.add('archive:$productId');
    _fail();
    snapshot = snapshot.copyWith(
      products: [
        for (final p in snapshot.products)
          if (p.id != productId) p,
      ],
    );
  }

  @override
  Future<String> uploadImage(Uint8List jpeg, {required String filename}) async {
    calls.add('upload:$filename');
    _fail();
    uploads.add(jpeg);
    return '/vendor-products/${'a' * 64}.jpg';
  }

  @override
  Future<void> deleteUpload(String path) async => calls.add('deleteUpload');

  @override
  Future<VendorSettings> updateSettings(VendorSettings settings) async {
    calls.add('settings');
    _fail();
    if (settings.version != snapshot.settings.version) throw conflict();
    final json = settings.toPatch()
      ..['version'] = settings.version + 1
      ..['updatedAt'] = DateTime.now().toUtc().toIso8601String();
    final saved = VendorSettings.fromJson(json);
    snapshot = snapshot.copyWith(settings: saved);
    return saved;
  }

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    calls.add('changePassword');
    _fail();
  }

  @override
  Future<List<TeamMember>> team() async {
    calls.add('team');
    _fail();
    return members;
  }

  @override
  Future<TeamMember> addTeamMember({
    required String name,
    required String email,
    required VendorRole role,
    required String temporaryPassword,
  }) async {
    calls.add('addTeamMember');
    _fail();
    final member = TeamMember(
      userId: 'user-${members.length + 1}',
      name: name,
      email: email,
      role: role,
      active: true,
      passwordChangePending: true,
      isCurrentUser: false,
      canManage: true,
      canResetPassword: true,
      memberSince: DateTime.now(),
    );
    members = [...members, member];
    return member;
  }

  TeamMember _replace(String userId, TeamMember Function(TeamMember member) change) {
    final updated = change(members.firstWhere((member) => member.userId == userId));
    members = [for (final m in members) m.userId == userId ? updated : m];
    return updated;
  }

  TeamMember _copy(TeamMember m, {VendorRole? role, bool? active, bool? pending}) => TeamMember(
    userId: m.userId,
    name: m.name,
    email: m.email,
    role: role ?? m.role,
    active: active ?? m.active,
    passwordChangePending: pending ?? m.passwordChangePending,
    isCurrentUser: m.isCurrentUser,
    canManage: m.canManage,
    canResetPassword: m.canResetPassword,
    memberSince: m.memberSince,
  );

  @override
  Future<TeamMember> setTeamMemberRole(String userId, VendorRole role) async {
    calls.add('role:$userId:${role.wire}');
    _fail();
    return _replace(userId, (m) => _copy(m, role: role));
  }

  @override
  Future<TeamMember> setTeamMemberActive(String userId, {required bool active}) async {
    calls.add('active:$userId:$active');
    _fail();
    return _replace(userId, (m) => _copy(m, active: active));
  }

  @override
  Future<TeamMember> setTemporaryPassword(String userId, String temporaryPassword) async {
    calls.add('temporaryPassword:$userId');
    _fail();
    return _replace(userId, (m) => _copy(m, pending: true));
  }
}
