const CUSTOMER_PHONE_CHARACTERS = /^\+?[0-9()\s-]+$/;

export function optionalCustomerPhoneError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digitCount = trimmed.replace(/\D/g, "").length;
  if (!CUSTOMER_PHONE_CHARACTERS.test(trimmed) || digitCount < 7 || digitCount > 15) {
    return "Enter a valid mobile number with 7 to 15 digits, or leave it blank.";
  }
  return null;
}
