import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../bootstrap/providers.dart';
import '../../theme/chapega_colors.dart';
import '../../ui/wordmark.dart';

/// Version, the privacy notice, and open-source licences.
class AboutScreen extends ConsumerWidget {
  const AboutScreen({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final device = ref.watch(deviceInfoProvider);
    final origin = ref.watch(appConfigProvider).apiOrigin;
    final text = Theme.of(context).textTheme;
    final colors = context.colors;
    final privacy = origin.replace(path: '/privacy', queryParameters: {'shop': slug});
    return Scaffold(
      appBar: AppBar(title: const Text('About')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Wordmark(size: 30, subtitle: 'Studio for shop teams'),
          const SizedBox(height: 16),
          Text('Version ${device.appVersion}', style: text.bodyMedium),
          if (!kReleaseMode) Text('Server: $origin', style: text.bodySmall),
          const SizedBox(height: 16),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: Icon(Icons.privacy_tip_outlined, color: colors.textAccent),
                  title: const Text('Privacy notice'),
                  subtitle: const Text('How customer details are kept and removed'),
                  trailing: const Icon(Icons.open_in_new, size: 18),
                  onTap: () => launchUrl(privacy, mode: LaunchMode.externalApplication),
                ),
                const Divider(),
                ListTile(
                  leading: Icon(Icons.description_outlined, color: colors.textAccent),
                  title: const Text('Open-source licences'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => showLicensePage(
                    context: context,
                    applicationName: 'Chapega Studio',
                    applicationVersion: device.appVersion,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Customer names and phone numbers are kept only in memory on this phone and are '
            'cleared when you sign out. New-order alerts never include customer details.',
            style: text.bodySmall,
          ),
        ],
      ),
    );
  }
}
