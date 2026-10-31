import 'package:flutter/foundation.dart';

/// Build-time settings. The API origin comes from
/// `--dart-define=CHAPEGA_API_ORIGIN=...`; see mobile/README.md.
@immutable
class AppConfig {
  const AppConfig({required this.apiOrigin, this.problem});

  /// Where release builds point unless told otherwise.
  static const productionOrigin = 'https://chapega.vercel.app';

  /// Plain HTTP is allowed only to the development server on this computer,
  /// and only in debug and profile builds. Dart's HTTP client ignores
  /// Android's cleartext setting, so this check is the real control.
  static const _developmentHosts = {'10.0.2.2', 'localhost', '127.0.0.1'};

  final Uri apiOrigin;

  /// Why the configured origin can't be used, or null. The app shows this
  /// instead of starting, so a mistaken build is obvious.
  final String? problem;

  static AppConfig fromEnvironment({bool? release, TargetPlatform? platform}) {
    const configured = String.fromEnvironment('CHAPEGA_API_ORIGIN');
    final isRelease = release ?? kReleaseMode;
    final target = platform ?? defaultTargetPlatform;
    final raw = configured.isNotEmpty
        ? configured
        : isRelease
        ? productionOrigin
        : target == TargetPlatform.iOS
        ? 'http://localhost:3000'
        : 'http://10.0.2.2:3000';
    return parse(raw, release: isRelease);
  }

  static AppConfig parse(String raw, {required bool release}) {
    final uri = Uri.tryParse(raw.trim());
    final fallback = Uri.parse(productionOrigin);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      return AppConfig(apiOrigin: fallback, problem: 'The API origin "$raw" is not a URL.');
    }
    if (uri.path.isNotEmpty && uri.path != '/' || uri.hasQuery || uri.hasFragment) {
      return AppConfig(
        apiOrigin: fallback,
        problem: 'The API origin must be only a scheme, host and port (got "$raw").',
      );
    }
    final origin = Uri(scheme: uri.scheme, host: uri.host, port: uri.hasPort ? uri.port : null);
    if (origin.scheme == 'https') return AppConfig(apiOrigin: origin);
    if (origin.scheme == 'http' && !release && _developmentHosts.contains(origin.host)) {
      return AppConfig(apiOrigin: origin);
    }
    return AppConfig(
      apiOrigin: fallback,
      problem: release
          ? 'Release builds only talk to HTTPS servers (got "$raw").'
          : 'Plain HTTP is only allowed to 10.0.2.2, localhost or 127.0.0.1 (got "$raw").',
    );
  }
}
