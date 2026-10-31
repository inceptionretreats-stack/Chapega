import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';

import '../theme/chapega_colors.dart';

/// A problem that applies to a whole form or screen (the web's
/// `vendor-inline-error`). Announced to screen readers when it appears.
class InlineError extends StatefulWidget {
  const InlineError(this.message, {super.key, this.action});

  final String message;
  final Widget? action;

  @override
  State<InlineError> createState() => _InlineErrorState();
}

class _InlineErrorState extends State<InlineError> {
  @override
  void initState() {
    super.initState();
    _announce();
  }

  @override
  void didUpdateWidget(InlineError oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.message != widget.message) _announce();
  }

  void _announce() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      SemanticsService.sendAnnouncement(
        View.of(context),
        widget.message,
        Directionality.of(context),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: colors.dangerSurface,
          border: Border.all(color: colors.dangerBorder),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 1),
              child: Icon(Icons.error_outline, size: 20, color: colors.dangerText),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.message,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: colors.dangerText,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (widget.action != null) ...[const SizedBox(height: 8), widget.action!],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A calm note (warnings, cautions) in the warning colours.
class CautionNote extends StatelessWidget {
  const CautionNote({super.key, required this.child, this.icon = Icons.info_outline});

  final Widget child;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.warningSurface,
        border: Border.all(color: colors.warningBorder),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: colors.warningText),
          const SizedBox(width: 10),
          Expanded(
            child: DefaultTextStyle.merge(
              style: TextStyle(color: colors.warningText),
              child: child,
            ),
          ),
        ],
      ),
    );
  }
}

/// "Nothing here yet" with an optional action.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.title,
    required this.message,
    this.icon = Icons.inbox_outlined,
    this.action,
  });

  final String title;
  final String message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 40, color: colors.muted),
          const SizedBox(height: 12),
          Text(title, style: text.titleMedium, textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Text(
            message,
            style: text.bodyMedium?.copyWith(color: colors.muted),
            textAlign: TextAlign.center,
          ),
          if (action != null) ...[const SizedBox(height: 16), action!],
        ],
      ),
    );
  }
}

/// A bordered card with a heading, like the web Studio's panels. The
/// heading is always inset; [padding] applies to the body, so list cards
/// can pass a zero horizontal padding and let their rows inset themselves.
class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    this.title,
    this.subtitle,
    this.trailing,
    required this.child,
    this.padding = const EdgeInsets.all(16),
  });

  final String? title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null)
            Padding(
              padding: EdgeInsets.fromLTRB(16, 16, trailing == null ? 16 : 6, 0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(header: true, child: Text(title!, style: text.titleLarge)),
                        if (subtitle != null) ...[
                          const SizedBox(height: 2),
                          Text(subtitle!, style: text.bodySmall),
                        ],
                      ],
                    ),
                  ),
                  ?trailing,
                ],
              ),
            ),
          Padding(padding: title == null ? padding : padding.copyWith(top: 12), child: child),
        ],
      ),
    );
  }
}

/// A filled button that shows a spinner and a "…ing" label while busy.
class PendingButton extends StatelessWidget {
  const PendingButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.pending = false,
    this.pendingLabel,
    this.icon,
    this.expand = true,
    this.destructive = false,
  });

  final String label;
  final String? pendingLabel;
  final VoidCallback? onPressed;
  final bool pending;
  final IconData? icon;
  final bool expand;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final child = Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (pending)
          SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2.4, color: colors.onAccent),
          )
        else if (icon != null)
          Icon(icon, size: 19),
        if (pending || icon != null) const SizedBox(width: 10),
        Flexible(child: Text(pending ? (pendingLabel ?? label) : label)),
      ],
    );
    final button = FilledButton(
      onPressed: pending ? null : onPressed,
      style: destructive
          ? FilledButton.styleFrom(backgroundColor: colors.danger, foregroundColor: colors.onAccent)
          : null,
      child: child,
    );
    return expand ? SizedBox(width: double.infinity, child: button) : button;
  }
}

/// A short confirmation at the bottom of the screen (the web's toasts).
void showToast(BuildContext context, String message) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  messenger?.hideCurrentSnackBar();
  messenger?.showSnackBar(
    SnackBar(content: Text(message), duration: const Duration(milliseconds: 3600)),
  );
}

/// Asks before something irreversible. Returns true when confirmed.
Future<bool> confirmAction(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  String cancelLabel = 'Cancel',
  bool destructive = true,
}) async {
  final colors = context.colors;
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(cancelLabel)),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: destructive
              ? FilledButton.styleFrom(
                  backgroundColor: colors.danger,
                  foregroundColor: colors.onAccent,
                )
              : null,
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return confirmed ?? false;
}
