import type { NextConfig } from "next";

const supabaseOrigin =
  process.env.CHAPEGA_DATA_BACKEND === "supabase"
    ? process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")
    : undefined;

const nextConfig: NextConfig = {
  async rewrites() {
    if (!supabaseOrigin) return [];
    return {
      beforeFiles: [
        {
          source: "/vendor-products/:path*",
          destination: `${supabaseOrigin}/storage/v1/object/public/vendor-products/:path*`,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
