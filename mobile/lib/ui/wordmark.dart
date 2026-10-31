import 'package:flutter/material.dart';

import '../theme/chapega_colors.dart';
import '../theme/chapega_theme.dart';

/// "Chapega.com" in Playfair Display, as on the web Studio (`.vendor-wordmark`).
class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.size = 29, this.subtitle});

  final double size;

  /// A small line under the wordmark, e.g. "Studio".
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final mark = Text.rich(
      TextSpan(
        text: 'Chapega',
        children: [
          TextSpan(
            text: '.com',
            style: TextStyle(fontSize: size * 0.72),
          ),
        ],
      ),
      semanticsLabel: 'Chapega.com',
      style: TextStyle(
        fontFamily: displayFontFamily,
        fontSize: size,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.04 * size,
        height: 1,
        color: colors.textAccent,
      ),
    );
    if (subtitle == null) return mark;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        mark,
        const SizedBox(height: 4),
        Text(
          subtitle!,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(color: colors.muted),
        ),
      ],
    );
  }
}
