import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_failure.dart';
import '../../domain/dates.dart';
import '../../domain/money.dart';
import '../../domain/order_status.dart';
import '../../domain/whatsapp.dart';
import '../../models/studio_snapshot.dart';
import '../../models/vendor_order.dart';
import '../../theme/chapega_colors.dart';
import '../../ui/feedback.dart';
import '../../ui/product_image.dart';
import '../../ui/status_badge.dart';
import '../alerts/new_order_alerts.dart';
import '../studio/studio_chrome.dart';
import '../studio/studio_store.dart';

/// One order: who, what, how much, its history, and the next step.
class OrderDetailScreen extends ConsumerStatefulWidget {
  const OrderDetailScreen({super.key, required this.slug, required this.orderId});

  final String slug;
  final String orderId;

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  bool _pending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(newOrderAlertsProvider.notifier).markSeen(widget.orderId);
    });
  }

  StudioStore get _store => ref.read(studioStoreProvider(widget.slug).notifier);

  /// After an order changes, stock and totals change too: sync everything.
  Future<void> _resync() async {
    await _store.refresh();
    if (!mounted) return;
    if (ref.read(studioStoreProvider(widget.slug)).sync == SyncStatus.error) {
      showToast(
        context,
        'The order was saved, but stock and dashboard totals could not be refreshed. Retry sync.',
      );
    }
  }

  Future<void> _showFailure(ApiFailure? failure, VendorOrder before) async {
    if (failure == null || failure.handled || !mounted) return;
    if (failure is HttpFailure &&
        (failure.code == 'VERSION_CONFLICT' || failure.code == 'INVALID_TRANSITION')) {
      // Someone else changed it: show what it is now, never retry blindly.
      await _store.refresh();
      final now = ref.read(studioStoreProvider(widget.slug)).data?.order(before.id);
      if (!mounted) return;
      setState(
        () => _error = now == null
            ? failure.message
            : 'This order was updated on another device. It is now ${now.status.label.toLowerCase()}.',
      );
      return;
    }
    setState(() => _error = failure.message);
  }

  Future<void> _transition(VendorOrder order, OrderStatus status) async {
    if (_pending) return;
    setState(() {
      _pending = true;
      _error = null;
    });
    VendorOrder? saved;
    final failure = await _store.guard(() async {
      saved = await _store.api.updateOrderStatus(order.id, status, order.version);
    });
    if (!mounted) return;
    setState(() => _pending = false);
    if (saved != null) {
      _store.commitOrder(saved!);
      showToast(context, 'Order ${order.orderNumber} is now ${status.label.toLowerCase()}.');
      await _resync();
    } else {
      await _showFailure(failure, order);
    }
  }

  Future<void> _cancel(VendorOrder order) async {
    final confirmed = await confirmAction(
      context,
      title: 'Cancel order ${order.orderNumber}?',
      message: order.inventoryCommitted
          ? 'Cancelling restores this order’s stock to the catalogue and cannot be undone. '
                'The customer is not notified automatically.'
          : 'No stock was reserved for this order. Cancelling cannot be undone. '
                'The customer is not notified automatically.',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
    );
    if (confirmed) await _transition(order, OrderStatus.cancelled);
  }

  Future<void> _removeDetails(VendorOrder order) async {
    final confirmed = await confirmAction(
      context,
      title: 'Remove customer details from ${order.orderNumber}?',
      message:
          "The customer's name, phone number, gift note and order note are deleted from this "
          'order. Items, amounts and status stay. This cannot be undone, and it does not delete '
          'WhatsApp chats.${order.status.isFinished ? '' : ' You will no longer see who placed this order.'}',
      confirmLabel: 'Remove details',
      cancelLabel: 'Keep details',
    );
    if (!confirmed || _pending) return;
    setState(() {
      _pending = true;
      _error = null;
    });
    VendorOrder? saved;
    final failure = await _store.guard(() async {
      saved = await _store.api.removeCustomerDetails(order.id, order.version);
    });
    if (!mounted) return;
    setState(() => _pending = false);
    if (saved != null) {
      _store.commitOrder(saved!);
      showToast(context, 'Customer details removed from ${order.orderNumber}.');
    } else {
      await _showFailure(failure, order);
    }
  }

  void _showMessage(VendorOrder order) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Prepared WhatsApp message', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                'What the kiosk prepared for the customer to send to the shop.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              Flexible(child: SingleChildScrollView(child: SelectableText(order.whatsappMessage))),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: order.whatsappMessage));
                  if (context.mounted) Navigator.of(context).pop();
                },
                icon: const Icon(Icons.copy),
                label: const Text('Copy message'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(studioStoreProvider(widget.slug).select((state) => state.data));
    final order = data?.order(widget.orderId);
    return Scaffold(
      appBar: StudioAppBar(
        slug: widget.slug,
        title: order?.orderNumber ?? 'Order',
        // The order number needs the room more than the sync status does.
        showSync: false,
        actions: [
          if (order != null && !order.detailsRemoved)
            PopupMenuButton<String>(
              tooltip: 'More actions',
              onSelected: (value) {
                if (value == 'message') _showMessage(order);
                if (value == 'remove') _removeDetails(order);
              },
              itemBuilder: (context) => [
                const PopupMenuItem(value: 'message', child: Text('View prepared message')),
                if ((data?.capabilities.eraseCustomerData ?? false) && order.customer.isNotEmpty)
                  const PopupMenuItem(value: 'remove', child: Text('Remove customer details')),
              ],
            ),
        ],
      ),
      body: StudioBody(
        slug: widget.slug,
        builder: (context, data) {
          final order = data.order(widget.orderId);
          if (order == null) {
            return const Center(
              child: EmptyState(
                icon: Icons.search_off,
                title: 'Order not found',
                message: 'This order is not in this shop, or it was removed.',
              ),
            );
          }
          return _OrderDetail(slug: widget.slug, data: data, order: order, error: _error);
        },
      ),
      bottomNavigationBar: order == null || order.status.isFinished
          ? null
          : _ActionBar(
              order: order,
              pending: _pending,
              onNext: () => _transition(order, order.status.next!),
              onCancel: () => _cancel(order),
            ),
    );
  }
}

class _OrderDetail extends StatelessWidget {
  const _OrderDetail({
    required this.slug,
    required this.data,
    required this.order,
    required this.error,
  });

  final String slug;
  final StudioSnapshot data;
  final VendorOrder order;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = context.colors;
    final customer = order.customer;
    final call = customerCallLink(customer.phone);
    final whatsapp = customerWhatsAppLink(customer.phone, data.settings.defaultCountryCode);
    final phoneLine = order.detailsRemoved
        ? 'Removed on request or after 30 days'
        : customer.phone.isEmpty
        ? 'No phone supplied'
        : customer.phone;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                '${formatVendorDate(order.createdAt)} · ${order.kioskName}',
                style: text.bodyMedium?.copyWith(color: colors.muted),
              ),
            ),
            const SizedBox(width: 12),
            OrderStatusBadge(order.status),
          ],
        ),
        const SizedBox(height: 12),
        if (error != null) ...[InlineError(error!), const SizedBox(height: 12)],
        if (order.status == OrderStatus.prepared) ...[
          const CautionNote(
            icon: Icons.error_outline,
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: 'Prepared does not mean sent. ',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  TextSpan(
                    text: 'Confirm only after the customer’s WhatsApp message reaches the shop.',
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],
        SectionCard(
          title: 'Customer',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(order.customerLabel, style: text.titleMedium),
              const SizedBox(height: 2),
              Text(phoneLine, style: text.bodyMedium?.copyWith(color: colors.muted)),
              if (!order.detailsRemoved && (call != null || whatsapp != null)) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (call != null)
                      OutlinedButton.icon(
                        onPressed: () => launchUrl(call),
                        icon: const Icon(Icons.call_outlined, size: 18),
                        label: const Text('Call'),
                      ),
                    if (whatsapp != null)
                      OutlinedButton.icon(
                        onPressed: () => launchUrl(whatsapp, mode: LaunchMode.externalApplication),
                        icon: const Icon(Icons.chat_outlined, size: 18),
                        label: const Text('WhatsApp'),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Items',
          child: Column(
            children: [
              for (final item in order.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ProductImage(slug: slug, path: item.image, size: 52),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(item.name, style: text.titleSmall),
                            Text(
                              [
                                ?item.variantName,
                                'Qty ${item.quantity}',
                                if (item.giftWrapped) 'Gift wrapped',
                              ].join(' · '),
                              style: text.bodySmall,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(formatInr(item.lineTotalPaise), style: text.titleSmall),
                    ],
                  ),
                ),
              const Divider(),
              const SizedBox(height: 8),
              _TotalLine(label: 'Subtotal', value: formatInr(order.subtotalPaise)),
              _TotalLine(label: 'Gift wrapping', value: formatInr(order.giftWrapPaise)),
              _TotalLine(label: 'Total', value: formatInr(order.totalPaise), strong: true),
              const SizedBox(height: 4),
              Align(
                alignment: Alignment.centerLeft,
                child: Text('Payment: Pay at Counter', style: text.bodySmall),
              ),
            ],
          ),
        ),
        if (customer.giftNote.isNotEmpty || customer.orderNote.isNotEmpty) ...[
          const SizedBox(height: 12),
          SectionCard(
            title: 'Customer notes',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (customer.giftNote.isNotEmpty)
                  _Note(label: 'Gift note', text: customer.giftNote),
                if (customer.orderNote.isNotEmpty)
                  _Note(label: 'Order note', text: customer.orderNote),
              ],
            ),
          ),
        ],
        const SizedBox(height: 12),
        SectionCard(
          title: 'Timeline',
          child: Column(
            children: [
              for (final event in order.events.reversed)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  leading: Icon(Icons.circle, size: 10, color: colors.textAccent),
                  minLeadingWidth: 10,
                  title: Text(event.to.label, style: text.titleSmall),
                  subtitle: Text(
                    [
                      '${event.actorName} · ${formatVendorDate(event.createdAt)}',
                      ?event.note,
                    ].join('\n'),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TotalLine extends StatelessWidget {
  const _TotalLine({required this.label, required this.value, this.strong = false});

  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final style = strong ? text.titleMedium : text.bodyMedium;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style)),
          Text(value, style: style),
        ],
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.label, required this.text});

  final String label;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: theme.labelMedium),
          const SizedBox(height: 2),
          Text(text, style: theme.bodyMedium),
        ],
      ),
    );
  }
}

class _ActionBar extends StatelessWidget {
  const _ActionBar({
    required this.order,
    required this.pending,
    required this.onNext,
    required this.onCancel,
  });

  final VendorOrder order;
  final bool pending;
  final VoidCallback onNext;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final next = order.status.next;
    return Material(
      color: context.colors.surface,
      child: SafeArea(
        top: false,
        child: Container(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: context.colors.border)),
          ),
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: Row(
            children: [
              if (next != null)
                Expanded(
                  child: PendingButton(
                    label: next.actionLabel,
                    pendingLabel: 'Updating…',
                    pending: pending,
                    icon: Icons.check,
                    onPressed: onNext,
                  ),
                ),
              const SizedBox(width: 10),
              OutlinedButton.icon(
                onPressed: pending ? null : onCancel,
                icon: const Icon(Icons.close, size: 18),
                label: const Text('Cancel order'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
