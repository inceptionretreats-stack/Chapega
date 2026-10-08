"use client";

/**
 * Last-resort error boundary for failures in the root layout. It replaces the
 * whole document, so it renders its own <html>/<body> and inline styles (the
 * app stylesheet and fonts are not available here). The server logs the same
 * failure with its digest through instrumentation.ts#onRequestError, so the
 * reference shown below lets support find the matching log line.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          background: "#faf7f2",
          color: "#2b2420",
        }}
      >
        <title>Chapega.com is temporarily unavailable</title>
        <main
          style={{ maxWidth: "28rem", textAlign: "center", lineHeight: 1.5 }}
        >
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 1.25rem" }}>
            We couldn&apos;t load this page. Your cart is kept in this browser.
            Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              font: "inherit",
              padding: "0.75rem 1.5rem",
              borderRadius: "999px",
              border: "none",
              background: "#2b2420",
              color: "#ffffff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ marginTop: "1.25rem", fontSize: "0.8rem", opacity: 0.7 }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
