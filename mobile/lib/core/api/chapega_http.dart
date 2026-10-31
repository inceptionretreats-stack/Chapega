import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../json.dart';
import 'api_failure.dart';

/// Returns the current session token, or null when signed out.
typedef TokenReader = String? Function();

/// The only HTTP client the app uses. It talks to one origin (the configured
/// Chapega.com API), adds the Bearer token, and turns every failure into an
/// [ApiFailure]. It never sends `Origin`, `Referer` or cookies: the server
/// treats requests without `Origin` as non-browser clients.
class ChapegaHttp {
  ChapegaHttp({
    required this.origin,
    required this._client,
    required this.userAgent,
    required this._token,
    this.timeout = const Duration(seconds: 20),
    this.uploadTimeout = const Duration(seconds: 90),
  });

  /// Scheme, host and port only, e.g. `https://chapega.vercel.app`.
  final Uri origin;
  final String userAgent;
  final Duration timeout;
  final Duration uploadTimeout;
  final http.Client _client;
  final TokenReader _token;

  /// Bodies at least this large are decoded off the UI isolate.
  static const _isolateDecodeBytes = 64 * 1024;

  Uri uri(String path) => origin.replace(path: path);

  Map<String, String> _headers({required bool authenticated, required bool background}) {
    final headers = <String, String>{'Accept': 'application/json', 'User-Agent': userAgent};
    final token = authenticated ? _token() : null;
    if (token != null) headers['Authorization'] = 'Bearer $token';
    // Timer-driven syncs must not keep an idle session alive.
    if (background) headers['x-chapega-refresh'] = 'background';
    return headers;
  }

  Future<JsonMap> get(String path, {bool background = false, bool authenticated = true}) =>
      send('GET', path, background: background, authenticated: authenticated);

  /// A JSON request. [body] is encoded as JSON when given; several DELETE
  /// endpoints take a body (`{version}`), which [http.Request] supports.
  Future<JsonMap> send(
    String method,
    String path, {
    Object? body,
    bool background = false,
    bool authenticated = true,
  }) {
    final request = http.Request(method, uri(path))
      ..headers.addAll(_headers(authenticated: authenticated, background: background))
      ..followRedirects = false;
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    return _run(request, timeout);
  }

  /// Uploads one product photo as multipart field `image`. The part declares
  /// `image/jpeg`: the server reads the type from the part, and the http
  /// package's default (`application/octet-stream`) is refused.
  Future<JsonMap> uploadJpeg(String path, {required Uint8List bytes, required String filename}) {
    final request = http.MultipartRequest('POST', uri(path))
      ..headers.addAll(_headers(authenticated: true, background: false))
      ..followRedirects = false
      ..files.add(
        http.MultipartFile.fromBytes(
          'image',
          bytes,
          filename: filename,
          contentType: MediaType('image', 'jpeg'),
        ),
      );
    return _run(request, uploadTimeout);
  }

  /// Product images are root-relative paths in API responses. Only the
  /// catalogue folders are allowed, so a bad value can't point the app at
  /// another host.
  Uri? imageUri(String path) {
    if (!RegExp(
      r'^/(products|generated-products|vendor-products)/[A-Za-z0-9._/-]+$',
    ).hasMatch(path)) {
      return null;
    }
    if (path.contains('..')) return null;
    return uri(path);
  }

  Future<JsonMap> _run(http.BaseRequest request, Duration limit) async {
    final http.Response response;
    try {
      final streamed = await _client.send(request).timeout(limit);
      response = await http.Response.fromStream(streamed).timeout(limit);
    } on TimeoutException catch (error) {
      throw NetworkFailure('timeout: $error');
    } on SocketException catch (error) {
      throw NetworkFailure('socket: ${error.message}');
    } on HandshakeException catch (error) {
      throw NetworkFailure('tls: ${error.message}');
    } on http.ClientException catch (error) {
      throw NetworkFailure('client: ${error.message}');
    } on HttpException catch (error) {
      throw NetworkFailure('http: ${error.message}');
    }

    final status = response.statusCode;
    final body = response.body;
    Object? decoded;
    if (body.isNotEmpty) {
      try {
        decoded = body.length >= _isolateDecodeBytes
            ? await Isolate.run(() => jsonDecode(body))
            : jsonDecode(body);
      } on FormatException {
        decoded = null;
      }
    }

    if (status >= 200 && status < 300) {
      if (body.isEmpty) return const {};
      if (decoded is Map<String, Object?>) return decoded;
      throw BadResponseFailure(status);
    }

    final error = decoded is Map<String, Object?> ? decoded['error'] : null;
    if (error is! Map<String, Object?>) throw BadResponseFailure(status);
    final fields = <String, List<String>>{};
    final rawFields = error['fields'];
    if (rawFields is Map<String, Object?>) {
      for (final entry in rawFields.entries) {
        final messages = entry.value;
        if (messages is List<Object?>) {
          fields[entry.key] = [
            for (final message in messages)
              if (message is String) message,
          ];
        }
      }
    }
    final retryAfterSeconds = int.tryParse(response.headers['retry-after'] ?? '');
    throw HttpFailure(
      status: status,
      code: error['code'] is String ? error['code']! as String : 'REQUEST_FAILED',
      message: error['message'] is String
          ? error['message']! as String
          : 'The request could not be completed.',
      fields: fields,
      retryAfter: retryAfterSeconds == null ? null : Duration(seconds: retryAfterSeconds),
    );
  }

  void close() => _client.close();
}
