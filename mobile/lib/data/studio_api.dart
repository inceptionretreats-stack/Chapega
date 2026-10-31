import 'dart:typed_data';

import '../core/api/chapega_http.dart';
import '../core/json.dart';
import '../domain/order_status.dart';
import '../domain/team.dart';
import '../models/studio_snapshot.dart';
import '../models/team_member.dart';
import '../models/vendor_order.dart';
import '../models/vendor_product.dart';
import '../models/vendor_settings.dart';

/// One shop's Studio endpoints (`/api/vendor/{slug}/…`), the same ones the web
/// Studio uses.
abstract interface class StudioApi {
  String get slug;

  Future<StudioSnapshot> bootstrap({bool background = false});

  Future<VendorOrder> updateOrderStatus(String orderId, OrderStatus status, int version);

  Future<VendorOrder> removeCustomerDetails(String orderId, int version);

  Future<VendorProduct> createProduct(ProductInput input);

  Future<VendorProduct> updateProduct(String productId, ProductInput input);

  Future<void> archiveProduct(String productId, int version);

  /// Uploads a JPEG and returns its path for the product's `image` field.
  Future<String> uploadImage(Uint8List jpeg, {required String filename});

  /// Best-effort cleanup of an upload no product uses.
  Future<void> deleteUpload(String path);

  Future<VendorSettings> updateSettings(VendorSettings settings);

  Future<void> changePassword({required String currentPassword, required String newPassword});

  Future<List<TeamMember>> team();

  Future<TeamMember> addTeamMember({
    required String name,
    required String email,
    required VendorRole role,
    required String temporaryPassword,
  });

  Future<TeamMember> setTeamMemberRole(String userId, VendorRole role);

  Future<TeamMember> setTeamMemberActive(String userId, {required bool active});

  Future<TeamMember> setTemporaryPassword(String userId, String temporaryPassword);
}

class HttpStudioApi implements StudioApi {
  HttpStudioApi(this._http, this.slug);

  final ChapegaHttp _http;

  @override
  final String slug;

  String get _base => '/api/vendor/${Uri.encodeComponent(slug)}';

  String _id(String value) => Uri.encodeComponent(value);

  @override
  Future<StudioSnapshot> bootstrap({bool background = false}) async =>
      StudioSnapshot.fromJson(await _http.get('$_base/bootstrap', background: background));

  @override
  Future<VendorOrder> updateOrderStatus(String orderId, OrderStatus status, int version) async {
    final json = await _http.send(
      'PATCH',
      '$_base/orders/${_id(orderId)}',
      body: {'status': status.wire, 'version': version},
    );
    return VendorOrder.fromJson(json.obj('order'));
  }

  @override
  Future<VendorOrder> removeCustomerDetails(String orderId, int version) async {
    final json = await _http.send(
      'DELETE',
      '$_base/orders/${_id(orderId)}/customer',
      body: {'version': version},
    );
    return VendorOrder.fromJson(json.obj('order'));
  }

  @override
  Future<VendorProduct> createProduct(ProductInput input) async {
    final json = await _http.send('POST', '$_base/products', body: input.toJson());
    return VendorProduct.fromJson(json.obj('product'));
  }

  @override
  Future<VendorProduct> updateProduct(String productId, ProductInput input) async {
    final json = await _http.send(
      'PATCH',
      '$_base/products/${_id(productId)}',
      body: input.toJson(),
    );
    return VendorProduct.fromJson(json.obj('product'));
  }

  @override
  Future<void> archiveProduct(String productId, int version) =>
      _http.send('DELETE', '$_base/products/${_id(productId)}', body: {'version': version});

  @override
  Future<String> uploadImage(Uint8List jpeg, {required String filename}) async {
    final json = await _http.uploadJpeg('$_base/uploads', bytes: jpeg, filename: filename);
    return json.obj('image').str('path');
  }

  @override
  Future<void> deleteUpload(String path) =>
      _http.send('DELETE', '$_base/uploads', body: {'path': path});

  @override
  Future<VendorSettings> updateSettings(VendorSettings settings) async {
    final json = await _http.send('PATCH', '$_base/settings', body: settings.toPatch());
    return VendorSettings.fromJson(json.obj('settings'));
  }

  @override
  Future<void> changePassword({required String currentPassword, required String newPassword}) =>
      _http.send(
        'POST',
        '$_base/account/password',
        body: {'currentPassword': currentPassword, 'newPassword': newPassword},
      );

  @override
  Future<List<TeamMember>> team() async =>
      (await _http.get('$_base/team')).list('members', TeamMember.fromJson);

  @override
  Future<TeamMember> addTeamMember({
    required String name,
    required String email,
    required VendorRole role,
    required String temporaryPassword,
  }) async {
    final json = await _http.send(
      'POST',
      '$_base/team',
      body: {
        'name': name.trim(),
        'email': email.trim(),
        'role': role.wire,
        'temporaryPassword': temporaryPassword,
      },
    );
    return TeamMember.fromJson(json.obj('member'));
  }

  @override
  Future<TeamMember> setTeamMemberRole(String userId, VendorRole role) async {
    final json = await _http.send('PATCH', '$_base/team/${_id(userId)}', body: {'role': role.wire});
    return TeamMember.fromJson(json.obj('member'));
  }

  @override
  Future<TeamMember> setTeamMemberActive(String userId, {required bool active}) async {
    final json = await _http.send('PATCH', '$_base/team/${_id(userId)}', body: {'active': active});
    return TeamMember.fromJson(json.obj('member'));
  }

  @override
  Future<TeamMember> setTemporaryPassword(String userId, String temporaryPassword) async {
    final json = await _http.send(
      'POST',
      '$_base/team/${_id(userId)}/password',
      body: {'temporaryPassword': temporaryPassword},
    );
    return TeamMember.fromJson(json.obj('member'));
  }
}
