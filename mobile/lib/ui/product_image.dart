import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../bootstrap/providers.dart';
import '../theme/chapega_colors.dart';

/// A catalogue photo from the API origin. Images live in memory only (no
/// disk cache); a path outside the catalogue folders shows a placeholder.
class ProductImage extends ConsumerWidget {
  const ProductImage({super.key, required this.slug, required this.path, this.size = 56});

  final String slug;
  final String path;
  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uri = ref.watch(chapegaHttpProvider).imageUri(path);
    final colors = context.colors;
    final placeholder = Container(
      width: size,
      height: size,
      color: colors.subtle,
      child: Icon(Icons.image_outlined, color: colors.muted, size: size * 0.45),
    );
    final pixels = (size * MediaQuery.devicePixelRatioOf(context)).round();
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: uri == null
          ? placeholder
          : Image.network(
              uri.toString(),
              width: size,
              height: size,
              fit: BoxFit.cover,
              cacheWidth: pixels,
              excludeFromSemantics: true,
              errorBuilder: (context, error, stackTrace) => placeholder,
              frameBuilder: (context, child, frame, synchronous) =>
                  frame == null && !synchronous ? placeholder : child,
            ),
    );
  }
}
