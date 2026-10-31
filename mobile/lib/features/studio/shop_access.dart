import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../session/session_controller.dart';
import '../session/session_state.dart';

/// Shops this session can no longer open (suspended, or access removed),
/// learnt from a refused request, plus a one-time notice for the shop picker.
@immutable
class ShopAccessState {
  const ShopAccessState({this.lost = const {}, this.notice});

  final Set<String> lost;
  final String? notice;
}

final shopAccessProvider = NotifierProvider<ShopAccess, ShopAccessState>(ShopAccess.new);

class ShopAccess extends Notifier<ShopAccessState> {
  @override
  ShopAccessState build() {
    // A new sign-in starts with a clean slate.
    ref.watch(
      sessionControllerProvider.select((state) => state is SignedIn ? state.user.id : null),
    );
    return const ShopAccessState();
  }

  void lose(String slug, String notice) {
    state = ShopAccessState(lost: {...state.lost, slug}, notice: notice);
  }

  void clearNotice() {
    if (state.notice != null) state = ShopAccessState(lost: state.lost);
  }
}
