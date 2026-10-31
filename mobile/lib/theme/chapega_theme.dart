import 'package:flutter/material.dart';

import 'chapega_colors.dart';

const String uiFontFamily = 'DM Sans';
const String displayFontFamily = 'Playfair Display';

/// Material 3 theme built from the web Studio's tokens. Controls use a 6 px
/// radius, cards 8 px with a 1 px border (no shadow), dialogs and sheets
/// 12 px, and every tap target is at least 48 px tall.
ThemeData buildChapegaTheme(Brightness brightness) {
  final c = brightness == Brightness.dark ? ChapegaColors.dark : ChapegaColors.light;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: c.accent,
    onPrimary: c.onAccent,
    primaryContainer: c.selected,
    onPrimaryContainer: c.textAccent,
    secondary: c.accent,
    onSecondary: c.onAccent,
    secondaryContainer: c.selected,
    onSecondaryContainer: c.textAccent,
    tertiary: c.successText,
    onTertiary: c.onAccent,
    error: c.danger,
    onError: c.onAccent,
    errorContainer: c.dangerSurface,
    onErrorContainer: c.dangerText,
    surface: c.surface,
    onSurface: c.text,
    onSurfaceVariant: c.muted,
    surfaceContainerLowest: c.surface,
    surfaceContainerLow: c.surface,
    surfaceContainer: c.page,
    surfaceContainerHigh: c.subtle,
    surfaceContainerHighest: c.subtle,
    outline: c.borderControl,
    outlineVariant: c.border,
    shadow: Colors.black,
    scrim: Colors.black,
    inverseSurface: c.text,
    onInverseSurface: c.surface,
    inversePrimary: c.textAccent,
    surfaceTint: Colors.transparent,
  );

  const controlRadius = BorderRadius.all(Radius.circular(6));
  const cardRadius = BorderRadius.all(Radius.circular(8));
  const dialogRadius = BorderRadius.all(Radius.circular(12));

  final base = ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    fontFamily: uiFontFamily,
    scaffoldBackgroundColor: c.page,
    canvasColor: c.surface,
    dividerColor: c.border,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    visualDensity: VisualDensity.standard,
    splashFactory: InkSparkle.splashFactory,
    extensions: [c],
  );

  final text = base.textTheme.apply(bodyColor: c.text, displayColor: c.text);
  final textTheme = text.copyWith(
    headlineSmall: text.headlineSmall?.copyWith(
      fontSize: 22,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.33,
    ),
    titleLarge: text.titleLarge?.copyWith(
      fontSize: 18,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.27,
    ),
    titleMedium: text.titleMedium?.copyWith(fontSize: 16, fontWeight: FontWeight.w600),
    titleSmall: text.titleSmall?.copyWith(fontSize: 14, fontWeight: FontWeight.w700),
    bodyLarge: text.bodyLarge?.copyWith(fontSize: 16, height: 1.45),
    bodyMedium: text.bodyMedium?.copyWith(fontSize: 14, height: 1.45),
    bodySmall: text.bodySmall?.copyWith(fontSize: 13, height: 1.4, color: c.muted),
    labelLarge: text.labelLarge?.copyWith(fontSize: 15, fontWeight: FontWeight.w700),
    labelMedium: text.labelMedium?.copyWith(fontSize: 13, fontWeight: FontWeight.w600),
    labelSmall: text.labelSmall?.copyWith(
      fontSize: 12,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.1,
    ),
  );

  final buttonText = textTheme.labelLarge;
  const buttonMinimum = Size(48, 48);
  const buttonPadding = EdgeInsets.symmetric(horizontal: 18, vertical: 12);

  OutlineInputBorder outline(Color color, [double width = 1]) => OutlineInputBorder(
    borderRadius: controlRadius,
    borderSide: BorderSide(color: color, width: width),
  );

  return base.copyWith(
    textTheme: textTheme,
    appBarTheme: AppBarTheme(
      backgroundColor: c.surface,
      foregroundColor: c.text,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: textTheme.titleLarge,
      shape: Border(bottom: BorderSide(color: c.border)),
    ),
    cardTheme: CardThemeData(
      color: c.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: cardRadius,
        side: BorderSide(color: c.border),
      ),
    ),
    dividerTheme: DividerThemeData(color: c.border, thickness: 1, space: 1),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: c.accent,
        foregroundColor: c.onAccent,
        disabledBackgroundColor: c.borderStrong,
        disabledForegroundColor: c.surface,
        minimumSize: buttonMinimum,
        padding: buttonPadding,
        textStyle: buttonText,
        shape: const RoundedRectangleBorder(borderRadius: controlRadius),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.text,
        minimumSize: buttonMinimum,
        padding: buttonPadding,
        textStyle: buttonText,
        side: BorderSide(color: c.borderStrong),
        shape: const RoundedRectangleBorder(borderRadius: controlRadius),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: c.textAccent,
        minimumSize: buttonMinimum,
        textStyle: buttonText,
        shape: const RoundedRectangleBorder(borderRadius: controlRadius),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: c.text),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: c.accent,
      foregroundColor: c.onAccent,
      elevation: 2,
      shape: const RoundedRectangleBorder(borderRadius: cardRadius),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      isDense: false,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: outline(c.borderControl),
      enabledBorder: outline(c.borderControl),
      focusedBorder: outline(c.accent, 2),
      errorBorder: outline(c.danger),
      focusedErrorBorder: outline(c.danger, 2),
      disabledBorder: outline(c.border),
      labelStyle: TextStyle(color: c.muted),
      floatingLabelStyle: TextStyle(color: c.textAccent, fontWeight: FontWeight.w600),
      hintStyle: TextStyle(color: c.muted),
      helperStyle: TextStyle(color: c.muted, fontSize: 12.5),
      errorStyle: TextStyle(color: c.dangerText, fontSize: 12.5, fontWeight: FontWeight.w600),
      helperMaxLines: 3,
      errorMaxLines: 3,
    ),
    chipTheme: ChipThemeData(
      backgroundColor: c.surface,
      selectedColor: c.selected,
      side: BorderSide(color: c.border),
      labelStyle: textTheme.labelMedium?.copyWith(color: c.text),
      secondaryLabelStyle: textTheme.labelMedium?.copyWith(color: c.textAccent),
      checkmarkColor: c.textAccent,
      shape: const RoundedRectangleBorder(borderRadius: controlRadius),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        selectedBackgroundColor: c.selected,
        selectedForegroundColor: c.textAccent,
        foregroundColor: c.text,
        side: BorderSide(color: c.borderStrong),
        minimumSize: const Size(48, 48),
        textStyle: textTheme.labelMedium,
        shape: const RoundedRectangleBorder(borderRadius: controlRadius),
      ),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? c.onAccent : c.borderControl,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? c.accent : c.subtle,
      ),
      trackOutlineColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? c.accent : c.borderControl,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: c.surface,
      indicatorColor: c.selected,
      elevation: 0,
      height: 68,
      surfaceTintColor: Colors.transparent,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => textTheme.labelSmall?.copyWith(
          color: states.contains(WidgetState.selected) ? c.textAccent : c.muted,
          fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w600,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) =>
            IconThemeData(color: states.contains(WidgetState.selected) ? c.textAccent : c.muted),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: c.surface,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(borderRadius: dialogRadius),
      titleTextStyle: textTheme.titleLarge,
      contentTextStyle: textTheme.bodyMedium,
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: c.borderStrong,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: c.text,
      contentTextStyle: textTheme.bodyMedium?.copyWith(color: c.surface),
      actionTextColor: brightness == Brightness.dark ? c.accent : c.selected,
      shape: const RoundedRectangleBorder(borderRadius: cardRadius),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: c.muted,
      textColor: c.text,
      minVerticalPadding: 12,
      titleTextStyle: textTheme.titleSmall,
      subtitleTextStyle: textTheme.bodySmall,
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: c.accent,
      linearTrackColor: c.subtle,
      circularTrackColor: Colors.transparent,
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(color: c.text, borderRadius: controlRadius),
      textStyle: textTheme.labelSmall?.copyWith(color: c.surface),
    ),
  );
}
