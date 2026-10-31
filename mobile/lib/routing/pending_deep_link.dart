import 'package:flutter_riverpod/flutter_riverpod.dart';

/// A shop location the app was asked to open (a notification tap) before
/// the person was signed in; resumed once the gates are passed.
class PendingDeepLink {
  String? _location;

  String? get location => _location;

  /// The shop named by the pending location, sent at sign-in so the session
  /// starts in that shop.
  String? get slug {
    final match = RegExp(r'^/s/([a-z0-9]+(?:-[a-z0-9]+)*)/').firstMatch(_location ?? '');
    return match?.group(1);
  }

  void remember(String location) {
    if (location.startsWith('/s/')) _location = location;
  }

  String? take() {
    final location = _location;
    _location = null;
    return location;
  }
}

final pendingDeepLinkProvider = Provider<PendingDeepLink>((ref) => PendingDeepLink());
