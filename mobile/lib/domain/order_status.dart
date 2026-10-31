/// Order statuses and the steps between them (`domain/vendor.ts`). The server
/// enforces the same rules; the app only offers allowed actions.
enum OrderStatus {
  prepared('prepared', 'Prepared on kiosk'),
  confirmed('confirmed', 'Confirmed'),
  preparing('preparing', 'Preparing'),
  ready('ready', 'Ready'),
  completed('completed', 'Completed'),
  cancelled('cancelled', 'Cancelled');

  const OrderStatus(this.wire, this.label);

  /// The value the API uses.
  final String wire;

  /// What the Studio shows.
  final String label;

  static OrderStatus parse(String value) => OrderStatus.values.firstWhere(
    (status) => status.wire == value,
    orElse: () => throw FormatException('Unknown order status "$value".'),
  );

  /// prepared → confirmed → preparing → ready → completed.
  static const sequence = [prepared, confirmed, preparing, ready, completed];

  bool get isFinished => this == completed || this == cancelled;

  /// The next step, or null when the order is finished.
  OrderStatus? get next {
    final index = sequence.indexOf(this);
    if (index < 0 || index >= sequence.length - 1) return null;
    return sequence[index + 1];
  }

  bool canTransitionTo(OrderStatus target) {
    if (isFinished || target == this) return false;
    if (target == cancelled) return true;
    return next == target;
  }

  /// The button that moves an order to this status: "Confirm order" or
  /// "Mark as ready".
  String get actionLabel => this == confirmed ? 'Confirm order' : 'Mark as ${label.toLowerCase()}';
}
