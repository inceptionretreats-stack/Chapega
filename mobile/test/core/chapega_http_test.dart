import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:chapega_studio/core/api/api_failure.dart';
import 'package:chapega_studio/core/api/chapega_http.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

final testToken = 'chapega_app_${'a' * 43}';

ChapegaHttp clientWith(Future<http.Response> Function(http.Request request) handler) => ChapegaHttp(
  origin: Uri.parse('https://chapega.example'),
  client: MockClient(handler),
  userAgent: 'ChapegaStudio/test',
  token: () => testToken,
);

http.Response json(Object body, {int status = 200, Map<String, String> headers = const {}}) =>
    http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json; charset=utf-8', ...headers},
    );

void main() {
  test('sends the Bearer token, never an Origin or cookie', () async {
    late http.Request seen;
    final client = clientWith((request) async {
      seen = request;
      return json({'ok': true});
    });
    await client.get('/api/vendor/chapega/bootstrap');
    expect(seen.url.toString(), 'https://chapega.example/api/vendor/chapega/bootstrap');
    expect(seen.headers['Authorization'], 'Bearer chapega_app_${'a' * 43}');
    expect(seen.headers.keys.map((key) => key.toLowerCase()), isNot(contains('origin')));
    expect(seen.headers.keys.map((key) => key.toLowerCase()), isNot(contains('cookie')));
    expect(seen.headers['x-chapega-refresh'], isNull);
  });

  test('marks timer-driven syncs as background and skips the token when asked', () async {
    late http.Request seen;
    final client = clientWith((request) async {
      seen = request;
      return json({});
    });
    await client.get('/api/studio-app/v1/session', background: true);
    expect(seen.headers['x-chapega-refresh'], 'background');
    await client.send('POST', '/api/studio-app/v1/login', body: {'a': 1}, authenticated: false);
    expect(seen.headers['Authorization'], isNull);
    expect(seen.headers['Content-Type'], 'application/json');
  });

  test('sends a JSON body with DELETE', () async {
    late http.Request seen;
    final client = clientWith((request) async {
      seen = request;
      return json({'ok': true});
    });
    await client.send('DELETE', '/api/vendor/chapega/products/mug', body: {'version': 3});
    expect(seen.method, 'DELETE');
    expect(jsonDecode(seen.body), {'version': 3});
  });

  test('turns API errors into HttpFailure with fields and Retry-After', () async {
    final client = clientWith(
      (request) async => json({
        'error': {
          'code': 'VALIDATION_ERROR',
          'message': 'Check the highlighted information and try again.',
          'fields': {
            'ownerWhatsAppNumber': ['Enter a valid WhatsApp number with 10 to 15 digits.'],
          },
        },
      }, status: 400),
    );
    final failure = await client
        .get('/x')
        .then<HttpFailure?>((_) => null, onError: (Object e) => e as HttpFailure);
    expect(failure!.status, 400);
    expect(failure.code, 'VALIDATION_ERROR');
    expect(failure.field('ownerWhatsAppNumber'), contains('10 to 15 digits'));

    final limited = clientWith(
      (request) async => json(
        {
          'error': {'code': 'RATE_LIMITED', 'message': 'Too many attempts.'},
        },
        status: 429,
        headers: {'retry-after': '12'},
      ),
    );
    await expectLater(
      limited.get('/x'),
      throwsA(
        isA<HttpFailure>().having((f) => f.retryAfter, 'retryAfter', const Duration(seconds: 12)),
      ),
    );
  });

  test('reports a proxy error page and a dropped connection clearly', () async {
    final html = clientWith((request) async => http.Response('<html>Bad gateway</html>', 502));
    await expectLater(
      html.get('/x'),
      throwsA(isA<BadResponseFailure>().having((f) => f.message, 'message', contains('trouble'))),
    );
    final offline = clientWith((request) async => throw const SocketException('down'));
    await expectLater(offline.get('/x'), throwsA(isA<NetworkFailure>()));
  });

  test('uploads one JPEG part named image', () async {
    final client = ChapegaHttp(
      origin: Uri.parse('https://chapega.example'),
      client: MockClient((request) async {
        final type = request.headers['content-type']!;
        expect(type, startsWith('multipart/form-data; boundary='));
        final body = latin1.decode(request.bodyBytes);
        expect(body, contains('name="image"; filename="product.jpg"'));
        expect(body, contains('content-type: image/jpeg'));
        expect(request.headers['Authorization'], startsWith('Bearer '));
        return json({
          'image': {'path': '/vendor-products/${'a' * 64}.jpg', 'width': 10, 'height': 10},
        }, status: 201);
      }),
      userAgent: 'ChapegaStudio/test',
      token: () => 'chapega_app_${'b' * 43}',
    );
    final result = await client.uploadJpeg(
      '/api/vendor/chapega/uploads',
      bytes: Uint8List.fromList([0xff, 0xd8, 0xff]),
      filename: 'product.jpg',
    );
    expect((result['image']! as Map<String, Object?>)['path'], startsWith('/vendor-products/'));
  });

  test('only loads images from the catalogue folders on the API origin', () {
    final client = clientWith((request) async => json({}));
    expect(
      client.imageUri('/generated-products/mug.png').toString(),
      'https://chapega.example/generated-products/mug.png',
    );
    expect(client.imageUri('https://evil.example/x.png'), isNull);
    expect(client.imageUri('//evil.example/x.png'), isNull);
    expect(client.imageUri('/vendor-products/../secret.png'), isNull);
    expect(client.imageUri('/api/vendor/chapega/bootstrap'), isNull);
  });
}
