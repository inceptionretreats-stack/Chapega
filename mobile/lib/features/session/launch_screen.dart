import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../theme/chapega_colors.dart';
import '../../ui/wordmark.dart';
import 'session_controller.dart';
import 'session_state.dart';

/// Shown while a stored session is checked, or when the server can't be
/// reached to check it (the session is kept; nothing is signed out).
class LaunchScreen extends ConsumerWidget {
  const LaunchScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Wordmark(size: 38, subtitle: 'Studio'),
                  const SizedBox(height: 32),
                  if (session is SessionUnreachable) ...[
                    Icon(Icons.cloud_off_outlined, size: 36, color: context.colors.muted),
                    const SizedBox(height: 12),
                    Text("Can't reach Chapega.com", style: text.titleMedium),
                    const SizedBox(height: 6),
                    Text(
                      '${session.failure.message} You are still signed in.',
                      textAlign: TextAlign.center,
                      style: text.bodyMedium?.copyWith(color: context.colors.muted),
                    ),
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: () => ref.read(sessionControllerProvider.notifier).restore(),
                      icon: const Icon(Icons.refresh),
                      label: const Text('Try again'),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () => ref.read(sessionControllerProvider.notifier).signOut(),
                      child: const Text('Sign out'),
                    ),
                  ] else
                    Semantics(
                      label: 'Opening the Studio',
                      child: const SizedBox(
                        width: 28,
                        height: 28,
                        child: CircularProgressIndicator(strokeWidth: 3),
                      ),
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
