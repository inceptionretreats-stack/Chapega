import 'package:chapega_studio/bootstrap/app_config.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('release builds default to production and accept only HTTPS', () {
    final config = AppConfig.fromEnvironment(release: true);
    expect(config.problem, isNull);
    expect(config.apiOrigin.toString(), 'https://chapega.vercel.app');

    final plain = AppConfig.parse('http://10.0.2.2:3000', release: true);
    expect(plain.problem, contains('HTTPS'));
    expect(plain.apiOrigin.scheme, 'https');
  });

  test('debug builds default to the development server on this computer', () {
    final android = AppConfig.fromEnvironment(release: false, platform: TargetPlatform.android);
    expect(android.apiOrigin.toString(), 'http://10.0.2.2:3000');
    final ios = AppConfig.fromEnvironment(release: false, platform: TargetPlatform.iOS);
    expect(ios.apiOrigin.toString(), 'http://localhost:3000');
  });

  test('plain HTTP only reaches the development hosts', () {
    expect(AppConfig.parse('http://127.0.0.1:3300', release: false).problem, isNull);
    expect(AppConfig.parse('http://example.com', release: false).problem, isNotNull);
    expect(AppConfig.parse('http://192.168.1.5:3000', release: false).problem, isNotNull);
  });

  test('an origin is only a scheme, host and port', () {
    expect(AppConfig.parse('https://chapega.vercel.app/', release: true).problem, isNull);
    expect(AppConfig.parse('https://chapega.vercel.app/api', release: true).problem, isNotNull);
    expect(AppConfig.parse('https://chapega.vercel.app?x=1', release: true).problem, isNotNull);
    expect(AppConfig.parse('not a url', release: true).problem, isNotNull);
    expect(
      AppConfig.parse('https://example.com:8443', release: true).apiOrigin.toString(),
      'https://example.com:8443',
    );
  });
}
