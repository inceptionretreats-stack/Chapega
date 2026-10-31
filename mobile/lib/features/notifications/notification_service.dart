import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart' show Color;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../../domain/money.dart';
import '../alerts/new_order_alerts.dart';

/// Android's channel for new-order alerts (local and push use the same id;
/// the server sends `channel_id: new_orders`).
const newOrdersChannelId = 'new_orders';

/// Where a notification tap should go: one shop's order.
@immutable
class NotificationTarget {
  const NotificationTarget({required this.slug, required this.orderId});

  final String slug;
  final String orderId;

  static final _slugPattern = RegExp(r'^[a-z0-9]+(?:-[a-z0-9]+)*$');
  static final _idPattern = RegExp(r'^[A-Za-z0-9_-]{1,100}$');

  /// Accepts only well-formed values, so a notification can't route the app
  /// anywhere unexpected.
  static NotificationTarget? from({required Object? slug, required Object? orderId}) {
    if (slug is! String || orderId is! String) return null;
    if (!_slugPattern.hasMatch(slug) || !_idPattern.hasMatch(orderId)) return null;
    return NotificationTarget(slug: slug, orderId: orderId);
  }

  static NotificationTarget? fromPayload(String? payload) {
    if (payload == null) return null;
    try {
      final json = jsonDecode(payload);
      if (json is! Map<String, Object?>) return null;
      return from(slug: json['shop'], orderId: json['order']);
    } on FormatException {
      return null;
    }
  }

  String get payload => jsonEncode({'v': 1, 'shop': slug, 'order': orderId});
}

/// "GFT-20261031-4821 · ₹1,299.00 · 2 items": the same wording as push.
/// Never the customer's name, phone or notes.
String newOrderBody(NewOrderBatch batch) {
  final order = batch.orders.first;
  if (batch.orders.length == 1) {
    final items = order.unitCount;
    return '${order.orderNumber} · ${formatInr(order.totalPaise)} · '
        '$items ${items == 1 ? 'item' : 'items'}';
  }
  final total = batch.orders.fold<int>(0, (sum, each) => sum + each.totalPaise);
  return '${batch.orders.length} orders · ${formatInr(total)}';
}

/// Local notifications: the `new_orders` channel, permission, showing an
/// alert, and reporting taps.
class NotificationService {
  NotificationService([FlutterLocalNotificationsPlugin? plugin])
    : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;
  void Function(NotificationTarget target)? onTap;
  bool _ready = false;

  Future<void> initialize() async {
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('ic_stat_chapega'),
          // Permission is asked when the person turns alerts on, not at launch.
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
        ),
        onDidReceiveNotificationResponse: (response) {
          final target = NotificationTarget.fromPayload(response.payload);
          if (target != null) onTap?.call(target);
        },
      );
      await _android?.createNotificationChannel(
        const AndroidNotificationChannel(
          newOrdersChannelId,
          'New orders',
          description: 'Kiosk orders as they arrive. Never includes customer details.',
          importance: Importance.high,
        ),
      );
      _ready = true;
    } on Object catch (error) {
      debugPrint('Notifications unavailable: $error');
    }
  }

  AndroidFlutterLocalNotificationsPlugin? get _android => Platform.isAndroid
      ? _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
      : null;

  IOSFlutterLocalNotificationsPlugin? get _ios => Platform.isIOS
      ? _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
      : null;

  /// The notification that opened the app from a cold start, if any.
  Future<NotificationTarget?> launchTarget() async {
    if (!_ready) return null;
    final details = await _plugin.getNotificationAppLaunchDetails();
    if (!(details?.didNotificationLaunchApp ?? false)) return null;
    return NotificationTarget.fromPayload(details?.notificationResponse?.payload);
  }

  Future<bool> permissionGranted() async {
    if (!_ready) return false;
    final android = _android;
    if (android != null) return await android.areNotificationsEnabled() ?? false;
    final ios = await _ios?.checkPermissions();
    return ios?.isEnabled ?? false;
  }

  /// Shows the system prompt (Android 13+, iOS). Returns whether allowed.
  Future<bool> requestPermission() async {
    if (!_ready) return false;
    final android = _android;
    if (android != null) return await android.requestNotificationsPermission() ?? false;
    return await _ios?.requestPermissions(alert: true, badge: true, sound: true) ?? false;
  }

  Future<void> showNewOrders(NewOrderBatch batch) async {
    if (!_ready || !await permissionGranted()) return;
    final first = batch.orders.first;
    final target = NotificationTarget(slug: batch.slug, orderId: first.id);
    await _plugin.show(
      id: first.id.hashCode & 0x7fffffff,
      title: batch.orders.length == 1 ? 'New kiosk order' : 'New kiosk orders',
      body: newOrderBody(batch),
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          newOrdersChannelId,
          'New orders',
          channelDescription: 'Kiosk orders as they arrive. Never includes customer details.',
          importance: Importance.high,
          priority: Priority.high,
          visibility: NotificationVisibility.private,
          icon: 'ic_stat_chapega',
          color: const Color(0xFF7A263A),
          tag: first.id,
          groupKey: batch.slug,
        ),
        iOS: DarwinNotificationDetails(threadIdentifier: batch.slug),
      ),
      payload: batch.orders.length == 1
          ? target.payload
          : NotificationTarget(slug: batch.slug, orderId: '_list').payload,
    );
  }

  Future<void> cancelAll() async {
    if (_ready) await _plugin.cancelAll();
  }
}
