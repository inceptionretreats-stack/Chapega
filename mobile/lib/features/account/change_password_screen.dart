import 'package:flutter/material.dart';

import '../../theme/chapega_colors.dart';
import '../../ui/feedback.dart';
import 'password_form.dart';

/// Change your own password. This phone stays signed in; every other device
/// (phones and the web Studio) is signed out.
class ChangePasswordScreen extends StatelessWidget {
  const ChangePasswordScreen({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Change password')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Your other devices will be signed out. This one stays signed in.',
            style: text.bodyMedium?.copyWith(color: context.colors.muted),
          ),
          const SizedBox(height: 16),
          PasswordForm(
            slug: slug,
            onChanged: () async {
              if (!context.mounted) return;
              Navigator.of(context).pop();
              showToast(context, 'Password changed. Your other devices were signed out.');
            },
          ),
        ],
      ),
    );
  }
}
