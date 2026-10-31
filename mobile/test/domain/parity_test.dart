import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:chapega_studio/domain/dates.dart';
import 'package:chapega_studio/domain/money.dart';
import 'package:chapega_studio/domain/order_privacy.dart';
import 'package:chapega_studio/domain/order_status.dart';
import 'package:chapega_studio/domain/phone_search.dart';
import 'package:chapega_studio/domain/team.dart';
import 'package:chapega_studio/domain/whatsapp.dart';
import 'package:flutter_test/flutter_test.dart';

/// The same vectors tests/unit/domain-parity.test.ts checks against the web's
/// TypeScript, so the Dart ports can't drift from domain/*.ts.
final Map<String, Object?> vectors =
    (jsonDecode(File('../tests/parity/domain-vectors.json').readAsStringSync())
        as Map<String, Object?>);

List<List<Object?>> rows(Object? value) => [
  for (final row in value! as List<Object?>) row! as List<Object?>,
];

void main() {
  test('formats paise as rupees with Indian grouping', () {
    for (final row in rows(vectors['formatInr'])) {
      expect(formatInr(row[0]! as int), row[1], reason: '${row[0]} paise');
    }
  });

  test('normalizes WhatsApp numbers like the server', () {
    final cases = vectors['normalizeWhatsAppNumber']! as Map<String, Object?>;
    for (final row in rows(cases['valid'])) {
      expect(normalizeWhatsAppNumber(row[0]! as String, row[1]! as String), row[2]);
    }
    for (final row in rows(cases['invalid'])) {
      expect(
        () => normalizeWhatsAppNumber(row[0]! as String, row[1]! as String),
        throwsA(isA<WhatsAppNumberError>().having((error) => error.code, 'code', row[2])),
        reason: '"${row[0]}"',
      );
    }
  });

  test('formats and masks WhatsApp numbers', () {
    for (final row in rows(vectors['formatWhatsAppNumber'])) {
      expect(formatWhatsAppNumber(row[0]! as String), row[1]);
    }
    for (final row in rows(vectors['maskWhatsAppNumber'])) {
      expect(maskWhatsAppNumber(row[0]! as String), row[1]);
    }
  });

  test('labels order statuses and allows the same steps', () {
    final labels = vectors['orderLabels']! as Map<String, Object?>;
    for (final status in OrderStatus.values) {
      expect(status.label, labels[status.wire]);
    }
    final next = vectors['nextOrderStatus']! as Map<String, Object?>;
    for (final status in OrderStatus.values) {
      expect(status.next?.wire, next[status.wire], reason: status.wire);
    }
    for (final row in rows(vectors['orderTransitions'])) {
      final from = OrderStatus.parse(row[0]! as String);
      final to = OrderStatus.parse(row[1]! as String);
      expect(from.canTransitionTo(to), row[2], reason: '${row[0]} → ${row[1]}');
    }
  });

  test('matches phone numbers by their digits', () {
    for (final row in rows(vectors['phoneMatches'])) {
      expect(phoneMatches(row[0]! as String, row[1]! as String), row[2], reason: '$row');
    }
  });

  test('describes how long ago something happened', () {
    final now = DateTime.utc(2026, 10, 31, 12);
    for (final row in rows(vectors['relativeVendorTimeMinutes'])) {
      final then = now.subtract(Duration(minutes: row[0]! as int));
      expect(relativeVendorTime(then, now), row[1]);
    }
  });

  test('generates temporary passwords in the shared format', () {
    final format = vectors['temporaryPassword']! as Map<String, Object?>;
    final pattern = RegExp(format['pattern']! as String);
    final random = Random(7);
    for (var index = 0; index < 200; index++) {
      expect(generateTemporaryPassword(random), matches(pattern));
    }
    expect(generateTemporaryPassword(), matches(pattern));
  });

  test('recognises the server\'s customer-details removal messages', () {
    final messages = vectors['redactionMessages']! as Map<String, Object?>;
    expect(retentionRedactionMessage, messages['retention']);
    expect(requestRedactionMessage, messages['request']);
  });
}
