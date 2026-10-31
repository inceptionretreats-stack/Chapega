import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'notification_service.dart';
import 'push_service.dart';

/// Created in main.dart once the platform plugins are ready; tests leave
/// them unset (no notifications, no push).
final notificationServiceProvider = Provider<NotificationService?>((ref) => null);

/// Null when this build has no Firebase settings (push off and hidden).
final pushServiceProvider = Provider<PushService?>((ref) => null);
