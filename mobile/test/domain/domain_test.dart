import 'package:chapega_studio/domain/dates.dart';
import 'package:chapega_studio/domain/money.dart';
import 'package:chapega_studio/domain/order_status.dart';
import 'package:chapega_studio/domain/whatsapp.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('money', () {
    test('refuses negative amounts, as the web does', () {
      expect(() => formatInr(-1), throwsRangeError);
    });

    test('parses typed rupee amounts like the web editor', () {
      expect(rupeesToPaise('499'), 49900);
      expect(rupeesToPaise(' 499.50 '), 49950);
      expect(rupeesToPaise('0.005'), 1); // Math.round(0.5) == 1
      expect(rupeesToPaise(''), isNull);
      expect(rupeesToPaise('abc'), isNull);
      expect(rupeesToPaise('-1'), isNull);
      expect(rupeesToPaise('1000000'), maxPricePaise);
      expect(rupeesToPaise('1000000.01'), isNull);
    });

    test('rounds negative adjustments like JavaScript', () {
      expect(signedRupeesToPaise('-120'), -12000);
      expect(signedRupeesToPaise('-0.005'), 0); // Math.round(-0.5) == -0
      expect(signedRupeesToPaise('-1000000.01'), isNull);
    });

    test('shows paise in input fields the way the web does', () {
      expect(paiseToRupeeInput(49900), '499');
      expect(paiseToRupeeInput(49950), '499.5');
      expect(paiseToRupeeInput(49905), '499.05');
      expect(paiseToRupeeInput(0), '0');
    });
  });

  group('dates', () {
    test('formats like the web Studio, in local time', () {
      final value = DateTime(2026, 10, 31, 11, 24);
      expect(formatVendorDate(value), '31 Oct, 11:24 am');
      expect(formatVendorDate(DateTime(2026, 10, 31, 0, 5)), '31 Oct, 12:05 am');
      expect(formatVendorDate(DateTime(2026, 10, 31, 12, 0)), '31 Oct, 12:00 pm');
      expect(formatShortDate(value), '31 Oct 2026');
      expect(formatDayHeading(value), 'Saturday, 31 October');
    });
  });

  group('order actions', () {
    test('name the next step', () {
      expect(OrderStatus.prepared.next!.actionLabel, 'Confirm order');
      expect(OrderStatus.confirmed.next!.actionLabel, 'Mark as preparing');
      expect(OrderStatus.ready.next!.actionLabel, 'Mark as completed');
      expect(OrderStatus.completed.next, isNull);
    });
  });

  group('customer contact links', () {
    test('open WhatsApp only for usable mobile numbers', () {
      expect(customerWhatsAppLink('98765 43210', '91').toString(), 'https://wa.me/919876543210');
      expect(customerWhatsAppLink('1234567', '91'), isNull);
      expect(customerWhatsAppLink('', '91'), isNull);
    });

    test('call the number as typed', () {
      expect(customerCallLink('+91 98765 43210').toString(), 'tel:+919876543210');
      expect(customerCallLink('98765 43210').toString(), 'tel:9876543210');
      expect(customerCallLink('123'), isNull);
    });

    test('test the shop number with the web Studio message', () {
      final link = whatsAppTestLink('98765 43210', '91')!;
      expect(link.host, 'wa.me');
      expect(link.path, '/919876543210');
      expect(
        link.queryParameters['text'],
        'Hello Chapega.com, this is a Vendor Studio connection test.',
      );
      expect(whatsAppTestLink('123', '91'), isNull);
    });
  });
}
