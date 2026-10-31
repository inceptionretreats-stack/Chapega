import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../bootstrap/providers.dart';
import '../../core/api/api_failure.dart';
import '../../ui/feedback.dart';
import '../session/session_controller.dart';

/// Current, new and confirm fields, shared by "Set a new password" (after a
/// temporary password) and Change password. The server enforces the policy
/// (at least 15 characters, not a common password) and says what's wrong.
class PasswordForm extends ConsumerStatefulWidget {
  const PasswordForm({
    super.key,
    required this.slug,
    required this.onChanged,
    this.currentLabel = 'Current password',
    this.submitLabel = 'Change password',
  });

  /// Any shop the person belongs to; the endpoint is shop-scoped.
  final String slug;
  final String currentLabel;
  final String submitLabel;
  final Future<void> Function() onChanged;

  @override
  ConsumerState<PasswordForm> createState() => _PasswordFormState();
}

class _PasswordFormState extends ConsumerState<PasswordForm> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  final _currentFocus = FocusNode();
  final _nextFocus = FocusNode();
  final _confirmFocus = FocusNode();
  bool _pending = false;
  bool _show = false;
  String? _error;
  String? _currentError;
  String? _nextError;
  String? _confirmError;

  @override
  void dispose() {
    for (final controller in [_current, _next, _confirm]) {
      controller.dispose();
    }
    for (final node in [_currentFocus, _nextFocus, _confirmFocus]) {
      node.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (_pending) return;
    setState(() {
      _error = null;
      _currentError = _current.text.isEmpty
          ? 'Enter your ${widget.currentLabel.toLowerCase()}.'
          : null;
      _nextError = _next.text.isEmpty ? 'Choose a new password.' : null;
      _confirmError = _confirm.text != _next.text ? "The new passwords don't match." : null;
    });
    if (_currentError != null) return _currentFocus.requestFocus();
    if (_nextError != null) return _nextFocus.requestFocus();
    if (_confirmError != null) return _confirmFocus.requestFocus();

    setState(() => _pending = true);
    final session = ref.read(sessionControllerProvider.notifier);
    try {
      await ref
          .read(studioApiProvider(widget.slug))
          .changePassword(currentPassword: _current.text, newPassword: _next.text);
      TextInput.finishAutofillContext();
      await widget.onChanged();
    } on HttpFailure catch (failure) {
      if (failure.status == 401) {
        await session.sessionEnded();
        return;
      }
      if (failure.code == 'PASSWORD_CHANGED_ELSEWHERE') {
        await session.signOut(
          notice: 'Your password was changed on another device. Sign in with the new one.',
        );
        return;
      }
      if (!mounted) return;
      setState(() {
        _currentError = failure.code == 'CURRENT_PASSWORD_INCORRECT'
            ? failure.message
            : failure.field('currentPassword');
        _nextError = failure.field('newPassword');
        _error = _currentError == null && _nextError == null ? failure.message : null;
      });
      if (_currentError != null) {
        _currentFocus.requestFocus();
      } else if (_nextError != null) {
        _nextFocus.requestFocus();
      }
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  Widget _field({
    required TextEditingController controller,
    required FocusNode focus,
    required String label,
    required String? error,
    required List<String> autofill,
    required TextInputAction action,
    required VoidCallback onSubmitted,
    String? helper,
  }) => TextField(
    controller: controller,
    focusNode: focus,
    obscureText: !_show,
    autocorrect: false,
    enableSuggestions: false,
    maxLength: 200,
    textInputAction: action,
    autofillHints: autofill,
    decoration: InputDecoration(
      labelText: label,
      errorText: error,
      helperText: error == null ? helper : null,
      counterText: '',
    ),
    onSubmitted: (_) => onSubmitted(),
  );

  @override
  Widget build(BuildContext context) {
    return AutofillGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error != null) ...[InlineError(_error!), const SizedBox(height: 16)],
          _field(
            controller: _current,
            focus: _currentFocus,
            label: widget.currentLabel,
            error: _currentError,
            autofill: const [AutofillHints.password],
            action: TextInputAction.next,
            onSubmitted: _nextFocus.requestFocus,
          ),
          const SizedBox(height: 14),
          _field(
            controller: _next,
            focus: _nextFocus,
            label: 'New password',
            error: _nextError,
            autofill: const [AutofillHints.newPassword],
            action: TextInputAction.next,
            onSubmitted: _confirmFocus.requestFocus,
            helper: 'At least 15 characters. A few unrelated words make a good passphrase.',
          ),
          const SizedBox(height: 14),
          _field(
            controller: _confirm,
            focus: _confirmFocus,
            label: 'Confirm new password',
            error: _confirmError,
            autofill: const [AutofillHints.newPassword],
            action: TextInputAction.done,
            onSubmitted: _submit,
          ),
          CheckboxListTile(
            value: _show,
            onChanged: (value) => setState(() => _show = value ?? false),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: const Text('Show passwords'),
          ),
          const SizedBox(height: 8),
          PendingButton(
            label: widget.submitLabel,
            pendingLabel: 'Saving…',
            pending: _pending,
            icon: Icons.key_outlined,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}
