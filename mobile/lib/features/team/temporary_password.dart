import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api/api_failure.dart';
import '../../domain/team.dart';
import '../../models/team_member.dart';
import '../../ui/feedback.dart';
import '../studio/studio_store.dart';

/// A temporary password field with "Generate" and show/hide.
class TemporaryPasswordField extends StatefulWidget {
  const TemporaryPasswordField({
    super.key,
    required this.controller,
    required this.error,
    required this.onChanged,
  });

  final TextEditingController controller;
  final String? error;
  final VoidCallback onChanged;

  @override
  State<TemporaryPasswordField> createState() => _TemporaryPasswordFieldState();
}

class _TemporaryPasswordFieldState extends State<TemporaryPasswordField> {
  bool _show = false;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: widget.controller,
          obscureText: !_show,
          autocorrect: false,
          enableSuggestions: false,
          maxLength: 200,
          decoration: InputDecoration(
            labelText: 'Temporary password',
            errorText: widget.error,
            helperText: widget.error == null
                ? 'At least 15 characters. They choose their own password when they first sign in.'
                : null,
            counterText: '',
            suffixIcon: IconButton(
              tooltip: _show ? 'Hide password' : 'Show password',
              onPressed: () => setState(() => _show = !_show),
              icon: Icon(_show ? Icons.visibility_off : Icons.visibility_outlined),
            ),
          ),
          onChanged: (_) => widget.onChanged(),
        ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () {
              widget.controller.text = generateTemporaryPassword();
              setState(() => _show = true);
              widget.onChanged();
            },
            icon: const Icon(Icons.auto_awesome_outlined, size: 18),
            label: const Text('Generate'),
          ),
        ),
      ],
    );
  }
}

/// What to give the person: their email and the temporary password.
class IssuedCredentials extends StatelessWidget {
  const IssuedCredentials({
    super.key,
    required this.name,
    required this.email,
    required this.password,
    required this.shopName,
    required this.onDone,
  });

  final String name;
  final String email;
  final String password;
  final String shopName;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final details = 'Chapega Studio for $shopName\nEmail: $email\nTemporary password: $password';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Give $name these details. They sign in at the Vendor Studio for $shopName and choose '
          'their own password straight away.',
          style: text.bodyMedium,
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Email', style: text.labelMedium),
                SelectableText(email, style: text.bodyLarge),
                const SizedBox(height: 10),
                Text('Temporary password', style: text.labelMedium),
                SelectableText(password, style: text.titleMedium),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: password));
            if (context.mounted) showToast(context, 'Password copied.');
          },
          icon: const Icon(Icons.copy),
          label: const Text('Copy password'),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () => SharePlus.instance.share(ShareParams(text: details)),
          icon: const Icon(Icons.share_outlined),
          label: const Text('Share details'),
        ),
        const SizedBox(height: 16),
        FilledButton(onPressed: onDone, child: const Text('Done')),
      ],
    );
  }
}

/// Set a temporary password for a team member who belongs to this shop only.
class TemporaryPasswordScreen extends ConsumerStatefulWidget {
  const TemporaryPasswordScreen({
    super.key,
    required this.slug,
    required this.member,
    required this.shopName,
  });

  final String slug;
  final TeamMember member;
  final String shopName;

  @override
  ConsumerState<TemporaryPasswordScreen> createState() => _TemporaryPasswordScreenState();
}

class _TemporaryPasswordScreenState extends ConsumerState<TemporaryPasswordScreen> {
  final _password = TextEditingController();
  bool _pending = false;
  String? _error;
  String? _fieldError;
  TeamMember? _issued;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_pending) return;
    setState(() {
      _pending = true;
      _error = null;
      _fieldError = null;
    });
    final store = ref.read(studioStoreProvider(widget.slug).notifier);
    TeamMember? saved;
    final failure = await store.guard(
      () async =>
          saved = await store.api.setTemporaryPassword(widget.member.userId, _password.text),
    );
    if (!mounted) return;
    setState(() {
      _pending = false;
      _issued = saved;
      if (failure != null && !failure.handled) {
        _fieldError = failure is HttpFailure ? failure.field('temporaryPassword') : null;
        _error = _fieldError == null ? failure.message : null;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final member = widget.member;
    final issued = _issued;
    return Scaffold(
      appBar: AppBar(
        title: Text(issued == null ? 'Set a temporary password' : 'Temporary password set'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: issued != null
            ? [
                IssuedCredentials(
                  name: member.name,
                  email: member.email,
                  password: _password.text,
                  shopName: widget.shopName,
                  onDone: () => Navigator.of(context).pop(issued),
                ),
              ]
            : [
                Text(
                  '${member.name} is signed out everywhere and must choose a new password at '
                  'the next sign-in.',
                ),
                const SizedBox(height: 16),
                if (_error != null) ...[InlineError(_error!), const SizedBox(height: 12)],
                TemporaryPasswordField(
                  controller: _password,
                  error: _fieldError,
                  onChanged: () => setState(() => _fieldError = null),
                ),
                const SizedBox(height: 16),
                PendingButton(
                  label: 'Set password',
                  pendingLabel: 'Saving…',
                  pending: _pending,
                  onPressed: _submit,
                ),
              ],
      ),
    );
  }
}
