import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/studio_snapshot.dart';
import '../../theme/chapega_colors.dart';
import '../../ui/feedback.dart';
import '../session/session_controller.dart';
import 'studio_store.dart';

/// The app bar every shop screen uses: the screen title, the shop's name,
/// and the sync status.
class StudioAppBar extends ConsumerWidget implements PreferredSizeWidget {
  const StudioAppBar({
    super.key,
    required this.slug,
    required this.title,
    this.actions = const [],
    this.showSync = true,
  });

  final String slug;
  final String title;
  final List<Widget> actions;
  final bool showSync;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight + 6);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final synced = ref.watch(
      studioStoreProvider(slug).select((state) => state.data?.vendor.displayName),
    );
    final shopName =
        synced ??
        ref
            .watch(sessionControllerProvider.notifier)
            .user
            ?.membershipFor(slug)
            ?.vendor
            .displayName ??
        '';
    final text = Theme.of(context).textTheme;
    return AppBar(
      toolbarHeight: kToolbarHeight + 6,
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
          if (shopName.isNotEmpty)
            Text(
              shopName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: text.labelSmall?.copyWith(color: context.colors.muted),
            ),
        ],
      ),
      actions: [
        ...actions,
        if (showSync) SyncChip(slug: slug),
        const SizedBox(width: 8),
      ],
    );
  }
}

/// "Synced now", "Synced 3m ago", "Syncing…" or "Sync issue" (tap to retry),
/// as on the web Studio.
class SyncChip extends ConsumerStatefulWidget {
  const SyncChip({super.key, required this.slug});

  final String slug;

  @override
  ConsumerState<SyncChip> createState() => _SyncChipState();
}

class _SyncChipState extends ConsumerState<SyncChip> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 20), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(studioStoreProvider(widget.slug));
    final colors = context.colors;
    final (label, icon, color) = switch (state.sync) {
      SyncStatus.syncing => ('Syncing…', Icons.sync, colors.muted),
      SyncStatus.error => ('Sync issue', Icons.sync_problem, colors.dangerText),
      SyncStatus.idle => (
        _syncedLabel(state.lastSyncedAt),
        Icons.cloud_done_outlined,
        colors.muted,
      ),
    };
    return Tooltip(
      message: state.sync == SyncStatus.error ? 'Sync now' : label,
      child: TextButton.icon(
        onPressed: state.sync == SyncStatus.syncing
            ? null
            : () => ref.read(studioStoreProvider(widget.slug).notifier).refresh(),
        style: TextButton.styleFrom(
          foregroundColor: color,
          disabledForegroundColor: colors.muted,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          textStyle: Theme.of(context).textTheme.labelSmall,
        ),
        icon: Icon(icon, size: 17),
        label: Text(label),
      ),
    );
  }

  String _syncedLabel(DateTime? lastSyncedAt) {
    if (lastSyncedAt == null) return 'Synced';
    final elapsed = DateTime.now().difference(lastSyncedAt);
    if (elapsed.inSeconds < 60) return 'Synced now';
    return 'Synced ${elapsed.inMinutes}m ago';
  }
}

/// Shows [builder] once the shop's data is loaded; until then a spinner, or
/// what went wrong with a way to retry.
class StudioBody extends ConsumerWidget {
  const StudioBody({super.key, required this.slug, required this.builder});

  final String slug;
  final Widget Function(BuildContext context, StudioSnapshot data) builder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(studioStoreProvider(slug));
    final data = state.data;
    if (data != null) return builder(context, data);
    final failure = state.lastError;
    if (state.sync == SyncStatus.error && failure != null && !failure.handled) {
      return Center(
        child: EmptyState(
          icon: Icons.cloud_off_outlined,
          title: "The shop couldn't be loaded",
          message: failure.message,
          action: FilledButton.icon(
            onPressed: () => ref.read(studioStoreProvider(slug).notifier).refresh(),
            icon: const Icon(Icons.refresh),
            label: const Text('Try again'),
          ),
        ),
      );
    }
    return const Center(child: CircularProgressIndicator());
  }
}
