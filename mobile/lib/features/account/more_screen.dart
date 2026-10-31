import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../routing/routes.dart';
import '../../theme/chapega_colors.dart';
import '../../theme/theme_mode.dart';
import '../../ui/feedback.dart';
import '../session/session_controller.dart';
import '../studio/studio_chrome.dart';
import '../studio/studio_shell.dart';

/// The account and app menu: who is signed in, other shops, team, password,
/// notifications, appearance, about, sign out.
class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(sessionControllerProvider);
    final user = ref.watch(sessionControllerProvider.notifier).user;
    final capabilities = capabilitiesFor(ref, slug);
    final membership = user?.membershipFor(slug);
    final otherShops = (user?.usableShops.length ?? 0) > 1;
    final text = Theme.of(context).textTheme;
    final colors = context.colors;

    Widget tile(IconData icon, String title, {String? subtitle, VoidCallback? onTap}) => ListTile(
      leading: Icon(icon, color: colors.textAccent),
      title: Text(title),
      subtitle: subtitle == null ? null : Text(subtitle),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );

    return Scaffold(
      appBar: StudioAppBar(slug: slug, title: 'More', showSync: false),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (user != null)
            Card(
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                leading: CircleAvatar(
                  backgroundColor: colors.selected,
                  foregroundColor: colors.textAccent,
                  child: Text(user.name.isEmpty ? '?' : user.name[0].toUpperCase()),
                ),
                title: Text(user.name, style: text.titleMedium),
                subtitle: Text(
                  '${user.email}\n${membership?.role.label ?? ''} · ${membership?.vendor.displayName ?? slug}',
                ),
                isThreeLine: true,
              ),
            ),
          const SizedBox(height: 16),
          Card(
            child: Column(
              children: [
                if (otherShops)
                  tile(
                    Icons.storefront_outlined,
                    'Switch shop',
                    subtitle: 'Open another shop you work for',
                    onTap: () => context.go(Routes.shops),
                  ),
                if (capabilities.manageTeam)
                  tile(
                    Icons.group_outlined,
                    'Team',
                    subtitle: 'Add people and choose what they can do',
                    onTap: () => context.go(Routes.team(slug)),
                  ),
                tile(
                  Icons.key_outlined,
                  'Change password',
                  onTap: () => context.go(Routes.changePassword(slug)),
                ),
                tile(
                  Icons.notifications_outlined,
                  'Notifications',
                  subtitle: 'New-order alerts on this phone',
                  onTap: () => context.go(Routes.notifications(slug)),
                ),
                tile(
                  Icons.info_outline,
                  'About',
                  subtitle: 'Version, privacy notice and licences',
                  onTap: () => context.go(Routes.about(slug)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Appearance', style: text.titleSmall),
                  const SizedBox(height: 10),
                  SegmentedButton<ThemeMode>(
                    segments: const [
                      ButtonSegment(value: ThemeMode.system, label: Text('System')),
                      ButtonSegment(value: ThemeMode.light, label: Text('Light')),
                      ButtonSegment(value: ThemeMode.dark, label: Text('Dark')),
                    ],
                    selected: {ref.watch(themeModeProvider)},
                    showSelectedIcon: false,
                    onSelectionChanged: (selection) =>
                        ref.read(themeModeProvider.notifier).set(selection.first),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () async {
              final confirmed = await confirmAction(
                context,
                title: 'Sign out of the Studio?',
                message: 'This phone stops getting new-order alerts until you sign in again.',
                confirmLabel: 'Sign out',
                destructive: false,
              );
              if (confirmed) await ref.read(sessionControllerProvider.notifier).signOut();
            },
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
          ),
        ],
      ),
    );
  }
}
