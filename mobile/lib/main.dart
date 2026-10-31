import 'package:flutter/material.dart';

import 'theme/chapega_theme.dart';
import 'ui/wordmark.dart';

void main() {
  runApp(const ChapegaStudioApp());
}

class ChapegaStudioApp extends StatelessWidget {
  const ChapegaStudioApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Chapega Studio',
      debugShowCheckedModeBanner: false,
      theme: buildChapegaTheme(Brightness.light),
      darkTheme: buildChapegaTheme(Brightness.dark),
      home: const Scaffold(
        body: SafeArea(
          child: Center(child: Wordmark(size: 40, subtitle: 'Studio')),
        ),
      ),
    );
  }
}
