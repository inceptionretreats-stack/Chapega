import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:integration_test/integration_test_driver_extended.dart';

const _screens = {'01-home', '02-orders', '03-order-detail', '04-products'};

Future<void> main() async {
  final destination = Platform.environment['CHAPEGA_SCREENSHOT_DIR'];
  if (destination == null || destination.isEmpty) {
    throw StateError('Set CHAPEGA_SCREENSHOT_DIR to an explicit capture directory.');
  }
  if (Platform.environment['CHAPEGA_CAPTURE_DEVICE'] != 'emulator-5556') {
    throw StateError('Use only the dedicated emulator-5556 capture device.');
  }
  final directory = Directory(destination).absolute;
  await directory.create(recursive: true);
  final captured = <String, Map<String, Object>>{};

  await integrationDriver(
    onScreenshot: (String name, List<int> image, [Map<String, Object?>? args]) async {
      if (!_screens.contains(name) || image.length < 24) {
        return false;
      }
      final bytes = Uint8List.fromList(image);
      const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
      for (var index = 0; index < pngSignature.length; index++) {
        if (bytes[index] != pngSignature[index]) {
          return false;
        }
      }
      final header = ByteData.sublistView(bytes);
      final file = File('${directory.path}${Platform.pathSeparator}$name.png');
      if (await file.exists()) {
        throw StateError('Capture file already exists: $name.png');
      }
      // Preserve exactly the app-view PNG returned by Flutter's integration
      // plugin: no crop, rescale, composition or desktop screenshot.
      await file.writeAsBytes(bytes, flush: true);
      captured[name] = {
        'file': '$name.png',
        'width': header.getUint32(16),
        'height': header.getUint32(20),
        'bytes': bytes.length,
      };
      return true;
    },
    responseDataCallback: (_) async {
      if (captured.length != _screens.length) {
        throw StateError('A required screen was not captured.');
      }
      final metadata = File('${directory.path}${Platform.pathSeparator}capture-metadata.json');
      if (await metadata.exists()) {
        throw StateError('Capture metadata already exists.');
      }
      await metadata.writeAsString(
        const JsonEncoder.withIndent('  ').convert({
          'captureBuild': 'local-demo-debug',
          'apiOrigin': 'http://10.0.2.2:3340',
          'device': 'emulator-5556 (ChapegaCapture20261031)',
          'dataset': 'Synthetic local demo: fictional orders, no customer phone numbers',
          'captureMethod': 'Flutter integration-test app-view PNG, original bytes',
          'physicalPhoneAcceptance': false,
          'playDistributionAcceptance': false,
          'screenshots': captured.values.toList(),
        }),
        flush: true,
      );
    },
  );
}
