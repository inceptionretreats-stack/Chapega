import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_messenger.dart';
import 'routing/app_router.dart';
import 'theme/chapega_theme.dart';
import 'theme/theme_mode.dart';

class ChapegaStudioApp extends ConsumerWidget {
  const ChapegaStudioApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'Chapega Studio',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: appMessengerKey,
      theme: buildChapegaTheme(Brightness.light),
      darkTheme: buildChapegaTheme(Brightness.dark),
      themeMode: ref.watch(themeModeProvider),
      routerConfig: ref.watch(routerProvider),
      builder: (context, child) {
        // Large text stays usable, but layouts aren't pushed past 2x.
        final media = MediaQuery.of(context);
        return MediaQuery(
          data: media.copyWith(
            textScaler: media.textScaler.clamp(minScaleFactor: 1, maxScaleFactor: 2),
          ),
          child: child!,
        );
      },
    );
  }
}

/// Shown instead of the app when the build's API origin can't be used.
class ConfigurationProblemApp extends StatelessWidget {
  const ConfigurationProblemApp(this.problem, {super.key});

  final String problem;

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: buildChapegaTheme(Brightness.light),
    home: Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Center(child: Text('This build of Chapega Studio is misconfigured.\n\n$problem')),
        ),
      ),
    ),
  );
}
