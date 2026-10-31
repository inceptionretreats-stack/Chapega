import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../bootstrap/providers.dart';
import '../features/account/about_screen.dart';
import '../features/account/change_password_screen.dart';
import '../features/account/more_screen.dart';
import '../features/dashboard/dashboard_screen.dart';
import '../features/notifications/notification_settings_screen.dart';
import '../features/orders/order_detail_screen.dart';
import '../features/orders/orders_screen.dart';
import '../features/products/product_editor_screen.dart';
import '../features/products/products_screen.dart';
import '../features/session/launch_screen.dart';
import '../features/session/password_required_screen.dart';
import '../features/session/session_controller.dart';
import '../features/session/session_state.dart';
import '../features/session/sign_in_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/shops/shop_picker_screen.dart';
import '../features/studio/shop_access.dart';
import '../features/studio/studio_shell.dart';
import '../features/team/add_member_screen.dart';
import '../features/team/team_screen.dart';
import '../models/vendor_user.dart';
import '../ui/feedback.dart';
import 'pending_deep_link.dart';
import 'routes.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();

/// Re-runs the router's redirect when signing in or out, or when a shop
/// becomes unavailable. Plain user refreshes (every sync) don't count.
class RouterRefresh extends ChangeNotifier {
  RouterRefresh(Ref ref) {
    ref.listen(sessionControllerProvider, (previous, next) {
      if (_signature(previous) != _signature(next)) notifyListeners();
    });
    ref.listen(shopAccessProvider, (_, _) => notifyListeners());
  }

  static String _signature(SessionState? state) => switch (state) {
    SignedIn(:final user) => 'in:${user.id}:${_shops(user)}',
    PasswordChangeRequired(:final user) => 'password:${user.id}',
    SignedOut() => 'out',
    SessionUnreachable() => 'unreachable',
    SessionRestoring() || null => 'restoring',
  };

  static String _shops(VendorUser user) => [
    for (final membership in user.memberships)
      '${membership.vendor.slug}/${membership.role.wire}/${membership.usable}',
  ].join(',');
}

/// Where a signed-in person lands: the shop they used last, else their
/// default shop, else the picker.
String defaultLocation(VendorUser user, String? lastShop, Set<String> lost) {
  final usable = [
    for (final membership in user.usableShops)
      if (!lost.contains(membership.vendor.slug)) membership,
  ];
  if (usable.isEmpty) return Routes.shops;
  for (final slug in [lastShop, user.activeVendor.slug]) {
    for (final membership in usable) {
      if (membership.vendor.slug == slug) return Routes.home(slug!);
    }
  }
  return usable.length == 1 ? Routes.home(usable.single.vendor.slug) : Routes.shops;
}

/// The gatekeeper: which screen a location may show, given the session.
String? appRedirect(Ref ref, GoRouterState state) {
  final session = ref.read(sessionControllerProvider);
  final location = state.matchedLocation;
  final pending = ref.read(pendingDeepLinkProvider);
  final inShop = location.startsWith('/s/');

  switch (session) {
    case SessionRestoring() || SessionUnreachable():
      if (inShop) pending.remember(state.uri.toString());
      return location == Routes.launch ? null : Routes.launch;
    case SignedOut():
      if (inShop) pending.remember(state.uri.toString());
      return location == Routes.signIn ? null : Routes.signIn;
    case PasswordChangeRequired():
      if (inShop) pending.remember(state.uri.toString());
      return location == Routes.password ? null : Routes.password;
    case SignedIn(:final user):
      final access = ref.read(shopAccessProvider);
      if (location == Routes.launch || location == Routes.signIn || location == Routes.password) {
        return pending.take() ??
            defaultLocation(user, ref.read(preferencesProvider).lastShopSlug, access.lost);
      }
      if (location == Routes.shops) {
        // With a single shop there is nothing to choose, unless the picker
        // has something to explain.
        final usable = user.usableShops
            .where((membership) => !access.lost.contains(membership.vendor.slug))
            .toList();
        if (access.notice == null && usable.length == 1) {
          return Routes.home(usable.single.vendor.slug);
        }
        return null;
      }
      if (inShop) {
        final slug = state.pathParameters['slug'] ?? '';
        final membership = user.membershipFor(slug);
        if (membership == null || !membership.usable || access.lost.contains(slug)) {
          return Routes.shops;
        }
        // Screens the person's role can't use (the server refuses them too).
        final capabilities = VendorCapabilities.forRole(membership.role);
        if (location.contains('/products') && !capabilities.manageCatalogue) {
          return Routes.home(slug);
        }
        if (location.endsWith('/settings') && !capabilities.manageSettings) {
          return Routes.home(slug);
        }
        if (location.contains('/more/team') && !capabilities.manageTeam) {
          return Routes.more(slug);
        }
      }
      return null;
  }
}

String _slug(GoRouterState state) => state.pathParameters['slug']!;

/// go_router needs a concrete starting location for each tab branch. Tabs
/// are switched with `context.go` to the shop's own location (see
/// StudioShell), so this placeholder shop is never navigated to.
String _branchInitial(String tab) => '/s/_/$tab';

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = RouterRefresh(ref);
  final router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: Routes.launch,
    refreshListenable: refresh,
    redirect: (context, state) => appRedirect(ref, state),
    errorBuilder: (context, state) => const _NotFoundScreen(),
    routes: [
      GoRoute(path: Routes.launch, builder: (context, state) => const LaunchScreen()),
      GoRoute(path: Routes.signIn, builder: (context, state) => const SignInScreen()),
      GoRoute(path: Routes.password, builder: (context, state) => const PasswordRequiredScreen()),
      GoRoute(path: Routes.shops, builder: (context, state) => const ShopPickerScreen()),
      GoRoute(
        path: '/s/:slug',
        redirect: (context, state) =>
            state.uri.path.replaceAll(RegExp(r'/+$'), '') == '/s/${_slug(state)}'
            ? Routes.home(_slug(state))
            : null,
        routes: [
          // Full-screen editors above the tabs.
          GoRoute(
            path: 'products/new',
            parentNavigatorKey: rootNavigatorKey,
            builder: (context, state) => ProductEditorScreen(slug: _slug(state)),
          ),
          GoRoute(
            path: 'products/:productId/edit',
            parentNavigatorKey: rootNavigatorKey,
            builder: (context, state) => ProductEditorScreen(
              slug: _slug(state),
              productId: state.pathParameters['productId'],
            ),
          ),
        ],
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => StudioShell(slug: _slug(state), navigationShell: shell),
        branches: [
          StatefulShellBranch(
            initialLocation: _branchInitial('home'),
            routes: [
              GoRoute(
                path: '/s/:slug/home',
                builder: (context, state) => DashboardScreen(slug: _slug(state)),
              ),
            ],
          ),
          StatefulShellBranch(
            initialLocation: _branchInitial('orders'),
            routes: [
              GoRoute(
                path: '/s/:slug/orders',
                builder: (context, state) => OrdersScreen(slug: _slug(state)),
                routes: [
                  GoRoute(
                    path: ':orderId',
                    builder: (context, state) => OrderDetailScreen(
                      slug: _slug(state),
                      orderId: state.pathParameters['orderId']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            initialLocation: _branchInitial('products'),
            routes: [
              GoRoute(
                path: '/s/:slug/products',
                builder: (context, state) => ProductsScreen(slug: _slug(state)),
              ),
            ],
          ),
          StatefulShellBranch(
            initialLocation: _branchInitial('settings'),
            routes: [
              GoRoute(
                path: '/s/:slug/settings',
                builder: (context, state) => SettingsScreen(slug: _slug(state)),
              ),
            ],
          ),
          StatefulShellBranch(
            initialLocation: _branchInitial('more'),
            routes: [
              GoRoute(
                path: '/s/:slug/more',
                builder: (context, state) => MoreScreen(slug: _slug(state)),
                routes: [
                  GoRoute(
                    path: 'team',
                    builder: (context, state) => TeamScreen(slug: _slug(state)),
                    routes: [
                      GoRoute(
                        path: 'add',
                        parentNavigatorKey: rootNavigatorKey,
                        builder: (context, state) => AddMemberScreen(slug: _slug(state)),
                      ),
                    ],
                  ),
                  GoRoute(
                    path: 'password',
                    builder: (context, state) => ChangePasswordScreen(slug: _slug(state)),
                  ),
                  GoRoute(
                    path: 'notifications',
                    builder: (context, state) => NotificationSettingsScreen(slug: _slug(state)),
                  ),
                  GoRoute(
                    path: 'about',
                    builder: (context, state) => AboutScreen(slug: _slug(state)),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    refresh.dispose();
  });
  return router;
});

class _NotFoundScreen extends StatelessWidget {
  const _NotFoundScreen();

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(),
    body: Center(
      child: EmptyState(
        icon: Icons.search_off,
        title: 'Nothing here',
        message: 'This page is not part of the Studio.',
        action: FilledButton(
          onPressed: () => context.go(Routes.launch),
          child: const Text('Back to the Studio'),
        ),
      ),
    ),
  );
}
