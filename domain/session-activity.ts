/**
 * Timer-driven refreshes in Vendor Studio and the admin portal send this
 * header so they do not count as activity: a tab left open and unattended
 * still reaches its idle timeout instead of polling itself alive.
 */
export const BACKGROUND_REFRESH_HEADER = "x-chapega-refresh";

export const backgroundRefreshHeaders: Readonly<Record<string, string>> = {
  [BACKGROUND_REFRESH_HEADER]: "background",
};

export function isBackgroundRefresh(headers: Pick<Headers, "get">): boolean {
  return headers.get(BACKGROUND_REFRESH_HEADER) === "background";
}
