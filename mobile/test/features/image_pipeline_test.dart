import 'dart:typed_data';

import 'package:chapega_studio/features/products/image_pipeline.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

void main() {
  test('applies the EXIF rotation to the pixels (the server strips EXIF)', () async {
    // A landscape sensor image that the camera marked "rotate 90° clockwise".
    final sensor = img.Image(width: 40, height: 20)..clear(img.ColorRgb8(200, 30, 60));
    sensor.exif.imageIfd.orientation = 6;
    final jpeg = await prepareProductPhoto(Uint8List.fromList(img.encodeJpg(sensor)));

    final upright = img.decodeJpg(jpeg)!;
    expect((upright.width, upright.height), (20, 40));
    expect(upright.exif.imageIfd.orientation ?? 1, 1);
  });

  test('drops the camera metadata, such as location, before upload', () async {
    final photo = img.Image(width: 20, height: 20)..clear(img.ColorRgb8(90, 90, 90));
    photo.exif.imageIfd.model = 'Test phone';
    photo.exif.gpsIfd['GPSLatitudeRef'] = 'N';
    final original = img.encodeJpg(photo);
    expect(img.decodeJpg(original)!.exif.isEmpty, isFalse);

    final jpeg = await prepareProductPhoto(Uint8List.fromList(original));
    expect(img.decodeJpg(jpeg)!.exif.isEmpty, isTrue);
  });

  test('flattens transparency onto white and keeps JPEG output', () async {
    final logo = img.Image(width: 10, height: 10, numChannels: 4)
      ..clear(img.ColorRgba8(0, 0, 0, 0));
    final jpeg = await prepareProductPhoto(Uint8List.fromList(img.encodePng(logo)));
    expect(jpeg.sublist(0, 2), [0xff, 0xd8]);
    final pixel = img.decodeJpg(jpeg)!.getPixel(5, 5);
    expect(pixel.r, greaterThan(240));
  });

  test('scales large photos to 2048 px on the longest side', () async {
    final big = img.Image(width: 3000, height: 1500)..clear(img.ColorRgb8(10, 10, 10));
    final jpeg = await prepareProductPhoto(Uint8List.fromList(img.encodeJpg(big)));
    final scaled = img.decodeJpg(jpeg)!;
    expect((scaled.width, scaled.height), (2048, 1024));
  });

  test('explains formats it cannot read', () async {
    await expectLater(
      prepareProductPhoto(Uint8List.fromList([1, 2, 3, 4])),
      throwsA(isA<PhotoProblem>()),
    );
  });
}
