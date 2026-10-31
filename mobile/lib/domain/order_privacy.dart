/// Customer-details wording from `domain/order-privacy.ts`.
library;

/// Customer details are kept for this long (the web privacy notice says so).
const int orderRetentionDays = 30;

/// Must equal the text the server writes when the retention job runs.
const String retentionRedactionMessage = 'Customer details removed after the retention period.';

/// Must equal the text the server writes when a shop removes details.
const String requestRedactionMessage = "Customer details removed at the customer's request.";

/// Whether the shop removed the details, or the retention job did.
bool customerDetailsRemoved(String whatsappMessage) =>
    whatsappMessage == retentionRedactionMessage || whatsappMessage == requestRedactionMessage;
