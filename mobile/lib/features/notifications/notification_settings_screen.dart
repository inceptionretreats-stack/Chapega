import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../bootstrap/providers.dart';
import '../../core/platform/device_info.dart';
import '../../theme/chapega_colors.dart';
import '../../ui/feedback.dart';
import '../session/session_controller.dart';
import 'notification_providers.dart';

/// New-order alerts on this phone: system permission, alerts while the app
/// is open, and push notifications when this build supports them.
class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key, required this.slug});

  final String slug;

  @override
  ConsumerState<NotificationSettingsScreen> createState() => _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState extends ConsumerState<NotificationSettingsScreen> {
  bool? _allowed;
  bool _busy = false;
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    // Coming back from the system settings: check again.
    _lifecycle = AppLifecycleListener(onResume: _check);
    _check();
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  Future<void> _check() async {
    final allowed = await ref.read(notificationServiceProvider)?.permissionGranted() ?? false;
    if (mounted) setState(() => _allowed = allowed);
  }

  Future<void> _turnOn() async {
    final allowed = await ref.read(notificationServiceProvider)?.requestPermission() ?? false;
    if (!mounted) return;
    setState(() => _allowed = allowed);
    if (!allowed) await _openSettings();
  }

  Future<void> _openSettings() async {
    if (Platform.isAndroid) {
      try {
        await platformChannel.invokeMethod<bool>('openNotificationSettings');
      } on PlatformException {
        // Nothing more to offer.
      }
    } else {
      await launchUrl(Uri.parse('app-settings:'));
    }
  }

  Future<void> _setPush(bool on) async {
    final push = ref.read(pushServiceProvider);
    if (push == null || _busy) return;
    setState(() => _busy = true);
    final preferences = ref.read(preferencesProvider);
    final api = ref.read(sessionApiProvider);
    try {
      if (on) {
        final enabled = await push.enable(api);
        await preferences.setPushOptIn(enabled);
        if (mounted && !enabled) {
          showToast(context, 'Allow notifications for Chapega Studio to get push alerts.');
        }
      } else {
        await push.disable(api);
        await preferences.setPushOptIn(false);
      }
    } on Object {
      if (mounted) showToast(context, "Push notifications couldn't be changed. Try again.");
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = context.colors;
    final preferences = ref.watch(preferencesProvider);
    final push = ref.watch(pushServiceProvider);
    final serverEnabled = ref.watch(pushServerEnabledProvider);
    final allowed = _allowed;

    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SectionCard(
            title: 'On this phone',
            padding: const EdgeInsets.only(bottom: 8),
            child: Column(
              children: [
                ListTile(
                  leading: Icon(
                    allowed == true
                        ? Icons.notifications_active_outlined
                        : Icons.notifications_off_outlined,
                    color: allowed == true ? colors.successText : colors.muted,
                  ),
                  title: Text(
                    allowed == null
                        ? 'Checking…'
                        : allowed
                        ? 'Notifications are allowed'
                        : 'Notifications are off',
                  ),
                  subtitle: allowed == false
                      ? const Text('Turn them on to hear new kiosk orders.')
                      : null,
                  trailing: allowed == false
                      ? FilledButton(onPressed: _turnOn, child: const Text('Turn on'))
                      : null,
                ),
                SwitchListTile(
                  value: preferences.inAppAlerts,
                  onChanged: (value) async {
                    await preferences.setInAppAlerts(value);
                    if (value && allowed == false) await _turnOn();
                    if (mounted) setState(() {});
                  },
                  title: const Text('Alert me while the app is open'),
                  subtitle: const Text('A sound and a notification for each new kiosk order.'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            title: 'When the app is closed',
            padding: const EdgeInsets.fromLTRB(0, 0, 0, 8),
            child: push == null
                ? Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Text(
                      'Alerts arrive only while the app is open. Push notifications for a closed '
                      'app are not set up for this version of the app yet.',
                      style: text.bodyMedium,
                    ),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SwitchListTile(
                        value: preferences.pushOptIn,
                        onChanged: _busy ? null : _setPush,
                        title: const Text('Push notifications'),
                        subtitle: const Text(
                          'New orders reach this phone even when the app is closed. A phone that '
                          'is signed out, or not opened for 14 days, stops getting them.',
                        ),
                      ),
                      if (preferences.pushOptIn && serverEnabled == false)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                          child: Text(
                            'This phone is ready. Alerts start once Chapega.com switches push on.',
                            style: text.bodySmall,
                          ),
                        ),
                    ],
                  ),
          ),
          const SizedBox(height: 12),
          Text(
            'Alerts show the order number, items and total, never customer names or phone numbers.',
            style: text.bodySmall,
          ),
        ],
      ),
    );
  }
}
