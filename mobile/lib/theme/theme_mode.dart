import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../bootstrap/providers.dart';

/// System, Light or Dark, remembered on this phone (as the web Studio's
/// theme switch does).
final themeModeProvider = NotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);

class ThemeModeController extends Notifier<ThemeMode> {
  @override
  ThemeMode build() => ref.read(preferencesProvider).themeMode;

  Future<void> set(ThemeMode mode) async {
    state = mode;
    await ref.read(preferencesProvider).setThemeMode(mode);
  }
}
