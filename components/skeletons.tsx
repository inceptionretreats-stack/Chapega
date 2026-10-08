import type { CSSProperties, ReactNode } from "react";

/**
 * Skeletons appear only after this delay so fast loads never flash. The delay
 * is applied in CSS (.skeleton-reveal), not with a timer: a Suspense fallback
 * streamed from the server is not hydrated while it is pending, so a timer in
 * it would never start.
 */
export const SKELETON_DELAY_MS = 300;

type DelayedSkeletonProps = Readonly<{
  label: string;
  className?: string;
  children?: ReactNode;
}>;

export function DelayedSkeleton({ label, className, children }: DelayedSkeletonProps) {
  return (
    <div
      className={`skeleton-reveal${className ? ` ${className}` : ""}`}
      role="status"
      aria-live="polite"
      aria-label={label}
      style={{ "--skeleton-delay": `${SKELETON_DELAY_MS}ms` } as CSSProperties}
    >
      <span className="sr-only">{label}</span>
      <div className="skeleton-reveal__body" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

function Block({ className }: Readonly<{ className: string }>) {
  return <span className={`skeleton-block ${className}`} />;
}

function repeat(count: number, render: (index: number) => ReactNode) {
  return Array.from({ length: count }, (_, index) => render(index));
}

/** Studio shell: sidebar, top bar, metric cards and a list panel. */
export function VendorStudioSkeleton() {
  return (
    <DelayedSkeleton label="Loading Vendor Studio…" className="vendor-skeleton">
      <div className="vendor-skeleton__sidebar">
        <Block className="vendor-skeleton__brand" />
        {repeat(4, (index) => (
          <Block key={index} className="vendor-skeleton__nav" />
        ))}
      </div>
      <div className="vendor-skeleton__main">
        <div className="vendor-skeleton__topbar">
          <Block className="vendor-skeleton__title" />
          <Block className="vendor-skeleton__action" />
        </div>
        <div className="vendor-skeleton__metrics">
          {repeat(4, (index) => (
            <Block key={index} className="vendor-skeleton__metric" />
          ))}
        </div>
        <div className="vendor-skeleton__panel">
          <Block className="vendor-skeleton__panel-title" />
          {repeat(5, (index) => (
            <Block key={index} className="vendor-skeleton__row" />
          ))}
        </div>
      </div>
      <div className="vendor-skeleton__bottom-nav">
        {repeat(4, (index) => (
          <Block key={index} className="vendor-skeleton__tab" />
        ))}
      </div>
    </DelayedSkeleton>
  );
}

/** Platform admin shell: sidebar, heading, metric band and vendor table. */
export function AdminSkeleton() {
  return (
    <DelayedSkeleton label="Loading platform admin…" className="admin-skeleton">
      <div className="admin-skeleton__sidebar">
        <Block className="admin-skeleton__brand" />
        {repeat(4, (index) => (
          <Block key={index} className="admin-skeleton__nav" />
        ))}
      </div>
      <div className="admin-skeleton__main">
        <Block className="admin-skeleton__title" />
        <Block className="admin-skeleton__lede" />
        <Block className="admin-skeleton__band" />
        <div className="admin-skeleton__grid">
          <div className="admin-skeleton__panel">
            {repeat(4, (index) => (
              <Block key={index} className="admin-skeleton__row" />
            ))}
          </div>
          <Block className="admin-skeleton__rail" />
        </div>
      </div>
    </DelayedSkeleton>
  );
}

/** Kiosk welcome layout while the storefront is resolved in the browser. */
export function KioskStorefrontSkeleton() {
  return (
    <DelayedSkeleton label="Preparing this storefront…" className="kiosk-skeleton">
      <div className="kiosk-skeleton__header">
        <Block className="kiosk-skeleton__logo" />
        <Block className="kiosk-skeleton__pill" />
      </div>
      <div className="kiosk-skeleton__hero">
        <div className="kiosk-skeleton__copy">
          <Block className="kiosk-skeleton__line kiosk-skeleton__line--title" />
          <Block className="kiosk-skeleton__line kiosk-skeleton__line--title-short" />
          <Block className="kiosk-skeleton__line" />
          <Block className="kiosk-skeleton__button" />
        </div>
        <Block className="kiosk-skeleton__visual" />
      </div>
    </DelayedSkeleton>
  );
}

/** Generic kiosk screen (catalogue, cart, checkout) while its code loads. */
export function KioskScreenSkeleton({ label = "Loading…" }: Readonly<{ label?: string }>) {
  return (
    <DelayedSkeleton label={label} className="kiosk-skeleton kiosk-skeleton--screen">
      <div className="kiosk-skeleton__copy">
        <Block className="kiosk-skeleton__line kiosk-skeleton__line--title" />
        <Block className="kiosk-skeleton__line" />
      </div>
      <div className="kiosk-skeleton__cards">
        {repeat(4, (index) => (
          <Block key={index} className="kiosk-skeleton__card" />
        ))}
      </div>
    </DelayedSkeleton>
  );
}
