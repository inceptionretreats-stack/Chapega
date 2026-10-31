/// Everything that can go wrong talking to the Chapega.com API. Screens show
/// [message]; logic branches on the subtype and, for [HttpFailure], [code].
sealed class ApiFailure implements Exception {
  const ApiFailure();

  String get message;

  /// Set once a central handler (sign-out, password change, shop switch) has
  /// already reacted, so screens don't show a second error.
  bool get handled => false;

  @override
  String toString() => message;
}

/// The server answered with an error (`{error: {code, message, fields?}}`).
class HttpFailure extends ApiFailure {
  const HttpFailure({
    required this.status,
    required this.code,
    required this.message,
    this.fields = const {},
    this.retryAfter,
    this.handled = false,
  });

  final int status;
  final String code;
  @override
  final String message;

  /// Problems per request field (`{"pricePaise": ["…"]}`); top-level keys only.
  final Map<String, List<String>> fields;

  /// From the Retry-After header on 429 responses.
  final Duration? retryAfter;

  @override
  final bool handled;

  String? field(String name) {
    final messages = fields[name];
    return messages == null || messages.isEmpty ? null : messages.first;
  }

  HttpFailure markHandled() => HttpFailure(
    status: status,
    code: code,
    message: message,
    fields: fields,
    retryAfter: retryAfter,
    handled: true,
  );

  bool get isUnauthenticated => status == 401;
  bool get isConflict => status == 409;
  bool get isRateLimited => status == 429;
}

/// No answer: offline, DNS, TLS or a timeout.
class NetworkFailure extends ApiFailure {
  const NetworkFailure([this.detail]);

  /// For debug logs only; never shown.
  final String? detail;

  @override
  String get message => "Can't reach Chapega.com. Check the connection and try again.";
}

/// An answer the app can't read, such as a proxy's HTML error page.
class BadResponseFailure extends ApiFailure {
  const BadResponseFailure(this.status);

  final int? status;

  @override
  String get message => status != null && status! >= 500
      ? 'Chapega.com is having trouble right now. Try again in a moment.'
      : 'Chapega.com sent an unexpected response. Try again in a moment.';
}
