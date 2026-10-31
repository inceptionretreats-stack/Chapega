import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../bootstrap/providers.dart';
import '../../domain/team.dart';
import '../../models/vendor_user.dart';
import '../../routing/routes.dart';
import '../alerts/new_order_banner.dart';
import '../session/session_controller.dart';
import 'studio_store.dart';
import 'sync_scheduler.dart';

/// The Studio's bottom tabs. The branch indexes are fixed (the router has
/// five branches); which tabs show depends on the person's role.
enum StudioTab {
  home(0, 'Home', Icons.space_dashboard_outlined, Icons.space_dashboard),
  orders(1, 'Orders', Icons.receipt_long_outlined, Icons.receipt_long),
  products(2, 'Products', Icons.inventory_2_outlined, Icons.inventory_2),
  settings(3, 'Settings', Icons.tune_outlined, Icons.tune),
  more(4, 'More', Icons.menu, Icons.menu);

  const StudioTab(this.branch, this.label, this.icon, this.selectedIcon);

  final int branch;
  final String label;
  final IconData icon;
  final IconData selectedIcon;

  String location(String slug) => switch (this) {
    home => Routes.home(slug),
    orders => Routes.orders(slug),
    products => Routes.products(slug),
    settings => Routes.settings(slug),
    more => Routes.more(slug),
  };

  static List<StudioTab> visibleFor(VendorCapabilities capabilities) => [
    home,
    orders,
    if (capabilities.manageCatalogue) products,
    if (capabilities.manageSettings) settings,
    more,
  ];
}

/// What the person may do in [slug]: the shop's own answer once synced,
/// before that the role from their membership.
VendorCapabilities capabilitiesFor(WidgetRef ref, String slug) {
  final synced = ref.watch(studioStoreProvider(slug).select((state) => state.data?.capabilities));
  if (synced != null) return synced;
  final membership = ref.watch(sessionControllerProvider.notifier).user?.membershipFor(slug);
  // Without a membership the safest assumption is the smallest role.
  return VendorCapabilities.forRole(membership?.role ?? VendorRole.staff);
}

/// Hosts one shop's tabs and keeps its data fresh while the app is in use.
class StudioShell extends ConsumerStatefulWidget {
  const StudioShell({super.key, required this.slug, required this.navigationShell});

  final String slug;
  final StatefulNavigationShell navigationShell;

  @override
  ConsumerState<StudioShell> createState() => _StudioShellState();
}

class _StudioShellState extends ConsumerState<StudioShell> {
  SyncScheduler? _scheduler;

  /// The last location shown in each tab, so switching tabs returns there.
  final Map<int, String> _lastLocation = {};

  @override
  void initState() {
    super.initState();
    _startSync();
  }

  @override
  void didUpdateWidget(StudioShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.slug != widget.slug) {
      _scheduler?.dispose();
      _lastLocation.clear();
      _startSync();
    }
  }

  void _startSync() {
    final slug = widget.slug;
    final store = ref.read(studioStoreProvider(slug).notifier);
    _scheduler = SyncScheduler(
      refresh: ({required background}) => store.refresh(background: background),
      lastFailure: () => ref.read(studioStoreProvider(slug)).lastError,
    )..start();
    final preferences = ref.read(preferencesProvider);
    if (preferences.lastShopSlug != slug) preferences.setLastShopSlug(slug);
  }

  @override
  void dispose() {
    _scheduler?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final slug = widget.slug;
    final shell = widget.navigationShell;
    final tabs = StudioTab.visibleFor(capabilitiesFor(ref, slug));
    _lastLocation[shell.currentIndex] = GoRouterState.of(context).uri.toString();
    final selected = tabs.indexWhere((tab) => tab.branch == shell.currentIndex);
    final activeOrders = ref.watch(
      studioStoreProvider(
        slug,
      ).select((state) => state.data?.orders.where((order) => order.isActive).length ?? 0),
    );

    return Scaffold(
      body: NewOrderBannerHost(child: shell),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selected < 0 ? 0 : selected,
        onDestinationSelected: (index) {
          final tab = tabs[index];
          // Tapping the current tab again returns to its first screen.
          final target = tab.branch == shell.currentIndex
              ? tab.location(slug)
              : _lastLocation[tab.branch] ?? tab.location(slug);
          context.go(target);
        },
        destinations: [
          for (final tab in tabs)
            NavigationDestination(
              icon: tab == StudioTab.orders && activeOrders > 0
                  ? Badge.count(count: activeOrders, child: Icon(tab.icon))
                  : Icon(tab.icon),
              selectedIcon: tab == StudioTab.orders && activeOrders > 0
                  ? Badge.count(count: activeOrders, child: Icon(tab.selectedIcon))
                  : Icon(tab.selectedIcon),
              label: tab.label,
              tooltip: tab == StudioTab.orders && activeOrders > 0
                  ? '$activeOrders active orders'
                  : tab.label,
            ),
        ],
      ),
    );
  }
}
