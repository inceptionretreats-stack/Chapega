import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  assertSameOrigin,
  jsonResponse,
  parseJson,
  requireVendorRequest,
} from "@/server/vendor/api";
import { VendorServiceError } from "@/server/vendor/errors";
import { deleteUnusedVendorImage, VENDOR_UPLOAD_PATH_PATTERN } from "@/server/vendor/image-lifecycle";
import { saveVendorImage } from "@/server/vendor/images";

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

export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const { vendorSlug } = await context.params;
    const access = await requireVendorRequest(request, vendorSlug);
    assertCatalogueAccess(access.capabilities.manage_catalogue);
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > 9 * 1024 * 1024) {
      throw new VendorServiceError(413, "PAYLOAD_TOO_LARGE", "Image is too large.");
    }
    const formData = await request.formData();
    const file = formData.get("image");
    if (!(file instanceof File)) {
      throw new VendorServiceError(400, "IMAGE_REQUIRED", "Choose an image to upload.");
    }
    return jsonResponse({ image: await saveVendorImage(file, access.vendor.id, access.user.id) }, 201);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
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
}
