import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../theme/chapega_colors.dart';
import '../../ui/wordmark.dart';
import '../account/password_form.dart';
import 'session_controller.dart';
import 'session_state.dart';

/// After signing in with a temporary password someone else chose: nothing
/// else opens until the person picks their own (the server refuses it).
class PasswordRequiredScreen extends ConsumerWidget {
  const PasswordRequiredScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);
    if (session is! PasswordChangeRequired) return const Scaffold();
    final user = session.user;
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Align(alignment: Alignment.centerLeft, child: Wordmark(size: 30)),
                  const SizedBox(height: 8),
                  Text('Studio · ${user.activeVendor.displayName}', style: text.labelMedium),
                  const SizedBox(height: 28),
                  Semantics(
                    header: true,
                    child: Row(
                      children: [
                        Icon(Icons.key_outlined, color: context.colors.textAccent),
                        const SizedBox(width: 8),
                        Expanded(child: Text('Set a new password', style: text.headlineSmall)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Hi ${user.name}. You signed in with a temporary password that someone else '
                    'chose. Choose your own password to open the Studio; only you will know it.',
                    style: text.bodyMedium?.copyWith(color: context.colors.muted),
                  ),
                  const SizedBox(height: 24),
                  PasswordForm(
                    slug: user.activeVendor.slug,
                    currentLabel: 'Temporary password',
                    submitLabel: 'Save and open the Studio',
                    onChanged: () => ref.read(sessionControllerProvider.notifier).passwordChanged(),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => ref.read(sessionControllerProvider.notifier).signOut(),
                    child: const Text('Sign out'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
