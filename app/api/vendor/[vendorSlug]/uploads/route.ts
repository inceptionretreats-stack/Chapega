import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  assertSameOrigin,
  jsonResponse,
  parseJson,
  parseMultipart,
  requireVendorRequest,
} from "@/server/vendor/api";
import { VendorServiceError } from "@/server/vendor/errors";
import { deleteUnusedVendorImage, VENDOR_UPLOAD_PATH_PATTERN } from "@/server/vendor/image-lifecycle";
import { saveVendorImage } from "@/server/vendor/images";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
type Context = Readonly<{ params: Promise<{ vendorSlug: string }> }>;

const deleteVendorImageSchema = z.object({
  path: z.string().regex(VENDOR_UPLOAD_PATH_PATTERN),
}).strict();

function assertCatalogueAccess(canManageCatalogue: boolean): void {
  if (!canManageCatalogue) {
    throw new VendorServiceError(403, "FORBIDDEN", "Your role cannot manage catalogue images.");
  }
}

export const POST = withRequestContext(async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const { vendorSlug } = await context.params;
    const access = await requireVendorRequest(request, vendorSlug);
    assertCatalogueAccess(access.capabilities.manage_catalogue);
    const formData = await parseMultipart(request);
    const file = formData.get("image");
    if (!(file instanceof File)) {
      throw new VendorServiceError(400, "IMAGE_REQUIRED", "Choose an image to upload.");
    }
    return jsonResponse({ image: await saveVendorImage(file, access.vendor.id, access.user.id) }, 201);
  } catch (error) {
    return apiError(error);
  }
});

export const DELETE = withRequestContext(async function DELETE(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const [params, input] = await Promise.all([
      context.params,
      parseJson(request, deleteVendorImageSchema),
    ]);
    const access = await requireVendorRequest(request, params.vendorSlug);
    assertCatalogueAccess(access.capabilities.manage_catalogue);
    return jsonResponse({
      ok: true,
      image: await deleteUnusedVendorImage(input.path, access.vendor.id),
    });
  } catch (error) {
    return apiError(error);
  }
});
