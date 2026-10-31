import 'package:flutter/foundation.dart';

import '../../core/api/api_failure.dart';
import '../../models/vendor_user.dart';

/// Where the person is with signing in. The router reads this to decide which
/// screen may show.
@immutable
sealed class SessionState {
  const SessionState();
}

/// Checking a stored session at launch.
class SessionRestoring extends SessionState {
  const SessionRestoring();
}

/// A session is stored but the server couldn't be reached to check it. The
/// token is kept: a network problem never signs anyone out.
class SessionUnreachable extends SessionState {
  const SessionUnreachable(this.failure);
  final ApiFailure failure;
}

class SignedOut extends SessionState {
  const SignedOut({this.notice});

  /// Shown on the sign-in screen, e.g. "Your session ended. Sign in again."
  final String? notice;
}

/// Signed in with a temporary password that must be replaced first.
class PasswordChangeRequired extends SessionState {
  const PasswordChangeRequired(this.user);
  final VendorUser user;
}

class SignedIn extends SessionState {
  const SignedIn(this.user);
  final VendorUser user;
}
