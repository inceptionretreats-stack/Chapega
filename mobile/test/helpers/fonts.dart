import 'package:flutter/services.dart';

/// The app's bundled fonts, so layout checks measure real text widths. The
/// default test font draws every glyph as a 1 em square, about twice as wide.
Future<void> loadAppFonts() async {
  for (final (family, weights) in const [
    ('DM Sans', ['Regular', 'Medium', 'SemiBold', 'Bold']),
    ('Playfair Display', ['SemiBold', 'Bold']),
  ]) {
    final loader = FontLoader(family);
    for (final weight in weights) {
      loader.addFont(rootBundle.load('assets/fonts/${family.replaceAll(' ', '')}-$weight.ttf'));
    }
    await loader.load();
  }
}
