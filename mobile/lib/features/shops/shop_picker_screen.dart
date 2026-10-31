import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../bootstrap/providers.dart';
import '../../routing/routes.dart';
import '../../theme/chapega_colors.dart';
import '../../ui/feedback.dart';
import '../../ui/wordmark.dart';
import '../session/session_controller.dart';
import '../session/session_state.dart';
import '../studio/shop_access.dart';

/// Choose which shop to open (people who work for more than one), or the
/// explanation when none is available.
class ShopPickerScreen extends ConsumerWidget {
  const ShopPickerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);
    final access = ref.watch(shopAccessProvider);
    final text = Theme.of(context).textTheme;
    if (session is! SignedIn) return const Scaffold();
    final shops = [
      for (final membership in session.user.usableShops)
        if (!access.lost.contains(membership.vendor.slug)) membership,
    ];

    return Scaffold(
      appBar: AppBar(title: const Wordmark(size: 24)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (access.notice != null) ...[
              CautionNote(child: Text(access.notice!)),
              const SizedBox(height: 16),
            ],
            if (shops.isEmpty)
              EmptyState(
                icon: Icons.storefront_outlined,
                title: 'No shop to open',
                message: 'No active vendor workspace is assigned to this account.',
                action: OutlinedButton(
                  onPressed: () => ref.read(sessionControllerProvider.notifier).signOut(),
                  child: const Text('Sign out'),
                ),
              )
            else ...[
              Semantics(header: true, child: Text('Choose a shop', style: text.headlineSmall)),
              const SizedBox(height: 4),
              Text('Signed in as ${session.user.email}', style: text.bodySmall),
              const SizedBox(height: 16),
              Card(
                child: Column(
                  children: [
                    for (final (index, membership) in shops.indexed) ...[
                      if (index > 0) const Divider(),
                      ListTile(
                        leading: Icon(Icons.storefront_outlined, color: context.colors.textAccent),
                        title: Text(membership.vendor.displayName),
                        subtitle: Text('${membership.role.label} · /${membership.vendor.slug}'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () async {
                          ref.read(shopAccessProvider.notifier).clearNotice();
                          await ref
                              .read(preferencesProvider)
                              .setLastShopSlug(membership.vendor.slug);
                          if (context.mounted) context.go(Routes.home(membership.vendor.slug));
                        },
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 24),
              TextButton(
                onPressed: () => ref.read(sessionControllerProvider.notifier).signOut(),
                child: const Text('Sign out'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
