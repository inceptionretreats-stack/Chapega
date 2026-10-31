import 'package:flutter/material.dart';

/// The Studio's colour roles, copied from the web tokens in `app/atelier.css`
/// (light `:root`, dark `[data-theme="dark"]`). Screens read these through
/// `context.colors` instead of hard-coding hex values.
@immutable
class ChapegaColors extends ThemeExtension<ChapegaColors> {
  const ChapegaColors({
    required this.surface,
    required this.page,
    required this.subtle,
    required this.selected,
    required this.accent,
    required this.accentStrong,
    required this.textAccent,
    required this.onAccent,
    required this.text,
    required this.muted,
    required this.border,
    required this.borderStrong,
    required this.borderControl,
    required this.success,
    required this.successText,
    required this.successSurface,
    required this.successBorder,
    required this.warningText,
    required this.warningSurface,
    required this.warningBorder,
    required this.danger,
    required this.dangerText,
    required this.dangerSurface,
    required this.dangerBorder,
  });

  static const light = ChapegaColors(
    surface: Color(0xFFFFFFFF),
    page: Color(0xFFF6F5F4),
    subtle: Color(0xFFF0EEED),
    selected: Color(0xFFF4E8EB),
    accent: Color(0xFF7A263A),
    accentStrong: Color(0xFF5F182B),
    textAccent: Color(0xFF7A263A),
    onAccent: Color(0xFFFFFFFF),
    text: Color(0xFF1E1A1B),
    muted: Color(0xFF5F5759),
    border: Color(0xFFE2DEDF),
    borderStrong: Color(0xFFCBC5C6),
    borderControl: Color(0xFF8C8385),
    success: Color(0xFF1F6D43),
    successText: Color(0xFF1F6D43),
    successSurface: Color(0xFFE7F2EB),
    successBorder: Color(0xFFA9CFB8),
    warningText: Color(0xFF8A5518),
    warningSurface: Color(0xFFFAF0E1),
    warningBorder: Color(0xFFDCC29A),
    danger: Color(0xFFA83A45),
    dangerText: Color(0xFFA83A45),
    dangerSurface: Color(0xFFFBECED),
    dangerBorder: Color(0xFFC46A73),
  );

  static const dark = ChapegaColors(
    surface: Color(0xFF1F1B1C),
    page: Color(0xFF151213),
    subtle: Color(0xFF2A2526),
    selected: Color(0xFF3A2329),
    accent: Color(0xFF8B3548),
    accentStrong: Color(0xFF9E3F55),
    textAccent: Color(0xFFE68A9E),
    onAccent: Color(0xFFFFFFFF),
    text: Color(0xFFF3EFEF),
    muted: Color(0xFFB9B0B2),
    border: Color(0xFF3A3335),
    borderStrong: Color(0xFF4D4548),
    borderControl: Color(0xFF7A7174),
    success: Color(0xFF317C51),
    successText: Color(0xFF8FD0A8),
    successSurface: Color(0xFF15271D),
    successBorder: Color(0xFF2F5D43),
    warningText: Color(0xFFF0B86E),
    warningSurface: Color(0xFF2C2210),
    warningBorder: Color(0xFF6A5024),
    danger: Color(0xFFBA4A53),
    dangerText: Color(0xFFF2A0A8),
    dangerSurface: Color(0xFF33191D),
    dangerBorder: Color(0xFFB0565F),
  );

  /// Brand colours used only by the app icon and wordmark art.
  static const ivory = Color(0xFFFFF9F2);
  static const gold = Color(0xFFC69B57);

  final Color surface;
  final Color page;
  final Color subtle;
  final Color selected;
  final Color accent;
  final Color accentStrong;
  final Color textAccent;
  final Color onAccent;
  final Color text;
  final Color muted;
  final Color border;
  final Color borderStrong;
  final Color borderControl;
  final Color success;
  final Color successText;
  final Color successSurface;
  final Color successBorder;
  final Color warningText;
  final Color warningSurface;
  final Color warningBorder;
  final Color danger;
  final Color dangerText;
  final Color dangerSurface;
  final Color dangerBorder;

  @override
  ChapegaColors copyWith() => this;

  @override
  ChapegaColors lerp(covariant ThemeExtension<ChapegaColors>? other, double t) {
    if (other is! ChapegaColors) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    return ChapegaColors(
      surface: mix(surface, other.surface),
      page: mix(page, other.page),
      subtle: mix(subtle, other.subtle),
      selected: mix(selected, other.selected),
      accent: mix(accent, other.accent),
      accentStrong: mix(accentStrong, other.accentStrong),
      textAccent: mix(textAccent, other.textAccent),
      onAccent: mix(onAccent, other.onAccent),
      text: mix(text, other.text),
      muted: mix(muted, other.muted),
      border: mix(border, other.border),
      borderStrong: mix(borderStrong, other.borderStrong),
      borderControl: mix(borderControl, other.borderControl),
      success: mix(success, other.success),
      successText: mix(successText, other.successText),
      successSurface: mix(successSurface, other.successSurface),
      successBorder: mix(successBorder, other.successBorder),
      warningText: mix(warningText, other.warningText),
      warningSurface: mix(warningSurface, other.warningSurface),
      warningBorder: mix(warningBorder, other.warningBorder),
      danger: mix(danger, other.danger),
      dangerText: mix(dangerText, other.dangerText),
      dangerSurface: mix(dangerSurface, other.dangerSurface),
      dangerBorder: mix(dangerBorder, other.dangerBorder),
    );
  }
}

extension ChapegaThemeContext on BuildContext {
  ChapegaColors get colors => Theme.of(this).extension<ChapegaColors>()!;
}
