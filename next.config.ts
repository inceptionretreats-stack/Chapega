import type { NextConfig } from "next";
import { selectVendorDataBackend, supabaseProjectOrigin } from "./server/config/data-backend";

// Same selection rule as the runtime (server/supabase/config.ts): Supabase is
// used when CHAPEGA_DATA_BACKEND=supabase *or* when the Supabase variables
// are present, not only for the literal setting.
const dataBackend = selectVendorDataBackend(process.env);
const supabaseOrigin = dataBackend === "supabase" ? supabaseProjectOrigin(process.env) : undefined;
const isDevelopment = process.env.NODE_ENV === "development";

/**
 * Content Security Policy, enforced. It ran report-only first and every
 * kiosk, Studio and admin screen loaded without a violation. Without
 * per-request nonces (which would force dynamic rendering of every page)
 * Next.js needs inline scripts for its bootstrap data and inline styles for
 * style props.
 */
function contentSecurityPolicy(): string {
  const imageSources = ["'self'", "data:", "blob:", supabaseOrigin].filter(Boolean);
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources.join(" ")}`,
    "font-src 'self' data:",
    `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
    "media-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const securityHeaders = [
  // Clickjacking: Studio and admin must never be framed.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Browsers ignore HSTS over plain HTTP; never pin localhost in development.
  ...(isDevelopment
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  async rewrites() {
    return {
      beforeFiles: [
        supabaseOrigin
          ? {
              source: "/vendor-products/:path*",
              destination: `${supabaseOrigin}/storage/v1/object/public/vendor-products/:path*`,
            }
          : {
              // `next start` only serves public/ files that existed at build
              // time, so runtime uploads are streamed by a route handler.
              source: "/vendor-products/:path*",
              destination: "/api/vendor-products/:path*",
            },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
