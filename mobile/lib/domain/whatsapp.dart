/// WhatsApp number rules from `domain/whatsapp.ts`, so the app checks the
/// shop's number exactly as the server will.
library;

class WhatsAppNumberError implements Exception {
  const WhatsAppNumberError(this.code, this.message);

  /// NUMBER_REQUIRED, INVALID_COUNTRY_CODE or INVALID_LENGTH.
  final String code;
  final String message;

  @override
  String toString() => message;
}

String _digitsOnly(String value) => value.replaceAll(RegExp(r'\D'), '');

String _withoutLeadingZeros(String value) => value.replaceFirst(RegExp(r'^0+'), '');

/// Country code + number, digits only ("919876543210"). Throws
/// [WhatsAppNumberError] with the same wording the server uses.
String normalizeWhatsAppNumber(String rawNumber, [String defaultCountryCode = '91']) {
  final digits = _withoutLeadingZeros(_digitsOnly(rawNumber));
  final countryCode = _withoutLeadingZeros(_digitsOnly(defaultCountryCode));

  if (digits.isEmpty) {
    throw const WhatsAppNumberError('NUMBER_REQUIRED', 'Owner WhatsApp number is required.');
  }
  if (digits.length < 10 || digits.length > 15) {
    throw const WhatsAppNumberError(
      'INVALID_LENGTH',
      'Enter a valid WhatsApp number with 10 to 15 digits.',
    );
  }
  if (countryCode.isEmpty || countryCode.length > 3) {
    throw const WhatsAppNumberError(
      'INVALID_COUNTRY_CODE',
      'Enter a valid one-to-three digit country code.',
    );
  }

  if (countryCode == '91') {
    final national = digits.length == 10
        ? digits
        : digits.length == 12 && digits.startsWith('91')
        ? digits.substring(2)
        : digits.length == 13 && digits.startsWith('910')
        ? digits.substring(3)
        : '';
    if (!RegExp(r'^[6-9]\d{9}$').hasMatch(national)) {
      throw const WhatsAppNumberError(
        'INVALID_LENGTH',
        'Enter a valid 10-digit Indian mobile number, with or without country code 91.',
      );
    }
    return '91$national';
  }

  final normalized = digits.startsWith(countryCode) ? digits : '$countryCode$digits';
  if (normalized.length < 10 || normalized.length > 15) {
    throw const WhatsAppNumberError(
      'INVALID_LENGTH',
      'Enter a valid WhatsApp number with 10 to 15 digits including country code.',
    );
  }
  return normalized;
}

/// "••••••••3210", or "Not configured".
String maskWhatsAppNumber(String rawNumber, [int visibleDigits = 4]) {
  final digits = _digitsOnly(rawNumber);
  if (digits.isEmpty) return 'Not configured';
  final visible = visibleDigits.clamp(1, 4);
  final suffix = digits.substring(
    digits.length - (visible > digits.length ? digits.length : visible),
  );
  final hidden = digits.length - suffix.length;
  return '${'•' * (hidden < 4 ? 4 : hidden)}$suffix';
}

/// "+91 98765 43210" for Indian mobiles, otherwise `+` and the digits.
String formatWhatsAppNumber(String normalized) {
  final digits = _digitsOnly(normalized);
  final indian = RegExp(r'^91([6-9]\d{4})(\d{5})$').firstMatch(digits);
  return indian != null ? '+91 ${indian.group(1)} ${indian.group(2)}' : '+$digits';
}

/// The settings screen's "Test WhatsApp destination" link, or null while the
/// number is not usable.
Uri? whatsAppTestLink(String rawNumber, String countryCode) {
  try {
    final phone = normalizeWhatsAppNumber(rawNumber, countryCode);
    return Uri.https('wa.me', '/$phone', {
      'text': 'Hello Chapega.com, this is a Vendor Studio connection test.',
    });
  } on WhatsAppNumberError {
    return null;
  }
}

/// A WhatsApp chat with the customer, using the shop's country code for
/// numbers typed without one. Null when the number isn't a usable mobile.
Uri? customerWhatsAppLink(String customerPhone, String countryCode) {
  try {
    return Uri.https('wa.me', '/${normalizeWhatsAppNumber(customerPhone, countryCode)}');
  } on WhatsAppNumberError {
    return null;
  }
}

/// A `tel:` link for the customer's phone as they typed it, or null.
Uri? customerCallLink(String customerPhone) {
  final digits = _digitsOnly(customerPhone);
  if (digits.length < 7 || digits.length > 15) return null;
  return Uri(scheme: 'tel', path: customerPhone.trim().startsWith('+') ? '+$digits' : digits);
}
