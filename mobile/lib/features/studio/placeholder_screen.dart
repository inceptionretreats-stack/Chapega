import 'package:flutter/material.dart';

import '../../ui/feedback.dart';
import 'studio_chrome.dart';

/// Holds a tab's place until its screen is built.
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({super.key, required this.slug, required this.title});

  final String slug;
  final String title;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: StudioAppBar(slug: slug, title: title),
    body: const Center(
      child: EmptyState(
        icon: Icons.construction_outlined,
        title: 'Coming soon',
        message: 'This part of the Studio is on its way.',
      ),
    ),
  );
}
