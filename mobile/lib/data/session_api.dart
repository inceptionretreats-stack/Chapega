import '../core/api/chapega_http.dart';
import '../models/app_session.dart';

/// Sign-in for the app (`/api/studio-app/v1/*`). The token travels as
/// `Authorization: Bearer`; the app never uses cookies.
abstract interface class SessionApi {
  Future<SignInResult> signIn({
    required String email,
    required String password,
    required DeviceDetails device,
    String? vendorSlug,
  });

  /// The session's user. Throws `HttpFailure` 401 when the session ended.
  Future<SessionStatus> current({bool background = false});

  /// Ends this phone's session (idempotent).
  Future<void> signOut();

  /// Registers this phone for new-order push notifications.
  Future<bool> registerPushToken(String fcmToken);

  Future<void> removePushToken();
}

class HttpSessionApi implements SessionApi {
  HttpSessionApi(this._http);

  final ChapegaHttp _http;

  static const _base = '/api/studio-app/v1';

  @override
  Future<SignInResult> signIn({
    required String email,
    required String password,
    required DeviceDetails device,
    String? vendorSlug,
  }) async {
    final json = await _http.send(
      'POST',
      '$_base/login',
      authenticated: false,
      body: {
        'email': email.trim(),
        'password': password,
        'vendorSlug': ?vendorSlug,
        'device': device.toJson(),
      },
    );
    return SignInResult.fromJson(json);
  }

  @override
  Future<SessionStatus> current({bool background = false}) async =>
      SessionStatus.fromJson(await _http.get('$_base/session', background: background));

  @override
  Future<void> signOut() => _http.send('POST', '$_base/logout');

  @override
  Future<bool> registerPushToken(String fcmToken) async {
    final json = await _http.send(
      'PUT',
      '$_base/push-token',
      body: {'fcmToken': fcmToken},
      background: true,
    );
    return json['serverEnabled'] == true;
  }

  @override
  Future<void> removePushToken() => _http.send('DELETE', '$_base/push-token', background: true);
}
