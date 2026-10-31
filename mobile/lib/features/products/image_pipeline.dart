import 'dart:isolate';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';

/// The server's limits for a product photo (`server/vendor/images.ts`).
const maxUploadBytes = 8 * 1024 * 1024;

/// Longest side of an uploaded photo: sharp on a kiosk, small to send.
const maxPhotoSide = 2048;

/// Why a picked photo can't be used, in words a shop owner can act on.
class PhotoProblem implements Exception {
  const PhotoProblem(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Turns any photo the phone gives us into an upright JPEG the server
/// accepts. The camera's metadata (location, time, phone model) is dropped
/// here, and the server strips it again; the rotation flag goes with it, so
/// the rotation is applied to the pixels first. Transparency is flattened
/// onto white; the result is at most [maxPhotoSide] px and under 8 MB.
Future<Uint8List> prepareProductPhoto(Uint8List original) => Isolate.run(() => _prepare(original));

Uint8List _prepare(Uint8List original) {
  final decoded = img.decodeImage(original);
  if (decoded == null) {
    throw const PhotoProblem(
      'This photo format isn\'t supported. Choose a JPEG or PNG photo, or take a new one.',
    );
  }
  var image = img.bakeOrientation(decoded)..exif = img.ExifData();
  final longest = image.width > image.height ? image.width : image.height;
  if (longest > maxPhotoSide) {
    image = image.width >= image.height
        ? img.copyResize(image, width: maxPhotoSide, interpolation: img.Interpolation.average)
        : img.copyResize(image, height: maxPhotoSide, interpolation: img.Interpolation.average);
  }
  if (image.hasAlpha) {
    final white = img.Image(width: image.width, height: image.height)
      ..clear(img.ColorRgb8(255, 255, 255));
    image = img.compositeImage(white, image);
  }
  for (final quality in const [85, 75, 65]) {
    final jpeg = img.encodeJpg(image, quality: quality, chroma: img.JpegChroma.yuv420);
    if (jpeg.length <= maxUploadBytes) return jpeg;
  }
  throw const PhotoProblem('This photo is too large. Choose a smaller one.');
}

/// Picks a photo from the camera or the library. Separate so tests can
/// supply a photo without the platform picker.
abstract interface class PhotoSource {
  /// Null when the person cancelled.
  Future<Uint8List?> pick({required bool camera});

  /// A photo taken just before Android closed the app to free memory.
  Future<Uint8List?> recoverLost();
}

class DevicePhotoSource implements PhotoSource {
  final _picker = ImagePicker();

  @override
  Future<Uint8List?> pick({required bool camera}) async {
    final file = await _picker.pickImage(
      source: camera ? ImageSource.camera : ImageSource.gallery,
      // Scaled on the phone first, so the Dart side handles a small image.
      maxWidth: maxPhotoSide.toDouble(),
      maxHeight: maxPhotoSide.toDouble(),
      imageQuality: 92,
      requestFullMetadata: false,
    );
    return file?.readAsBytes();
  }

  @override
  Future<Uint8List?> recoverLost() async {
    final lost = await _picker.retrieveLostData();
    if (lost.isEmpty) return null;
    return lost.file?.readAsBytes();
  }
}

final photoSourceProvider = Provider<PhotoSource>((ref) => DevicePhotoSource());
