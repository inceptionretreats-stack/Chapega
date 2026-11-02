/** Only this small clock reference crosses the server/client boundary. */
export type VendorCalendarReference = Readonly<{ now: number; timeZone: string }>;

export function currentVendorCalendarReference(): VendorCalendarReference {
  return {
    now: Date.now(),
    timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** One formatter serves the heading and all of this render's order checks. */
export function vendorCalendar(reference: VendorCalendarReference) {
  const formatter = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: reference.timeZone,
  });
  function fields(date: Date) {
    const parts = formatter.formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)!.value;
    return {
      key: `${part("year")}-${part("month")}-${part("day")}`,
      // Node and Safari can supply different comma/space literals for en-IN.
      label: `${part("weekday")}, ${part("day")} ${part("month")}`,
    };
  }
  const today = fields(new Date(reference.now));
  return {
    label: today.label,
    includes(value: string): boolean {
      const date = new Date(value);
      return !Number.isNaN(date.getTime()) && fields(date).key === today.key;
    },
  };
}
