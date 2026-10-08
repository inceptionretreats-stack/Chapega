import { AlertCircle, Gift, RotateCcw } from "lucide-react";

export type ShopUnavailableKind = "not-found" | "suspended" | "unreachable";

const COPY: Record<ShopUnavailableKind, { title: string; body: string }> = {
  "not-found": {
    title: "We couldn’t find this shop",
    body: "Check the link or scan the shop’s QR code again.",
  },
  suspended: {
    title: "This shop isn’t taking orders right now",
    body: "Please ask a member of the shop’s team for help, or try again later.",
  },
  unreachable: {
    title: "We couldn’t load this shop",
    body: "Check the connection and try again. Nothing has been ordered.",
  },
};

export function ShopUnavailable({ kind }: Readonly<{ kind: ShopUnavailableKind }>) {
  const { title, body } = COPY[kind];
  const Icon = kind === "unreachable" ? AlertCircle : Gift;
  return (
    <main className="screen-page narrow">
      <div className="empty-state">
        <Icon size={46} aria-hidden="true" />
        <div>
          <h1 data-screen-heading tabIndex={-1}>{title}</h1>
          <p>{body}</p>
          {kind === "unreachable" ? (
            <a className="primary-button" href="">
              <RotateCcw size={18} aria-hidden="true" /> Try again
            </a>
          ) : null}
        </div>
      </div>
    </main>
  );
}
