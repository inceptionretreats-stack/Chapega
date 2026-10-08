import type { NextConfig } from "next";
import {
  selectVendorDataBackend,
  supabaseProjectOrigin,
} from "./server/config/data-backend";

// Same selection rule as the runtime (server/supabase/config.ts): Supabase is
// used when CHAPEGA_DATA_BACKEND=supabase *or* when the Supabase variables
// are present, not only for the literal setting.
const dataBackend = selectVendorDataBackend(process.env);
const supabaseOrigin =
  dataBackend === "supabase" ? supabaseProjectOrigin(process.env) : undefined;

const nextConfig: NextConfig = {
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
