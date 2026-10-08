import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VendorDatabase } from "@/server/vendor/database";

const state = vi.hoisted(() => ({
  backend: "local" as "local" | "supabase",
  database: {
    products: [],
    orders: [],
  } as unknown as VendorDatabase,
  exists: vi.fn(),
  remove: vi.fn(),
  stat: vi.fn(),
  storageFrom: vi.fn(),
  transactionReferenced: false,
  unlink: vi.fn(),
  updateCalls: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  stat: state.stat,
  unlink: state.unlink,
}));
vi.mock("@/server/supabase/config", () => ({
  usesSupabaseBackend: () => state.backend === "supabase",
}));
vi.mock("@/server/vendor/database", () => ({
  updateLocalVendorDatabase: async <T,>(
    mutation: (database: VendorDatabase) => Promise<T> | T,
  ) => {
    state.updateCalls += 1;
    return mutation(structuredClone(state.database));
  },
}));
vi.mock("@/server/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: state.storageFrom,
    },
  }),
}));
vi.mock("@/server/supabase/postgres", () => ({
  getSupabasePostgres: () => ({
    begin: async <T,>(operation: (transaction: unknown) => Promise<T>) => {
      let query = 0;
      const transaction = () => {
        query += 1;
        return query === 1
          ? Promise.resolve([])
          : Promise.resolve([{ referenced: state.transactionReferenced }]);
      };
      return operation(transaction);
    },
  }),
}));

import {
  assertProductImageExists,
  deleteUnusedVendorImage,
} from "@/server/vendor/image-lifecycle";

const hash = "a".repeat(64);
const imagePath = `/vendor-products/${hash}.png` as const;

function database(
  products: VendorDatabase["products"] = [],
  orders: VendorDatabase["orders"] = [],
): VendorDatabase {
  return { products, orders } as unknown as VendorDatabase;
}

beforeEach(() => {
  state.backend = "local";
  state.database = database();
  state.transactionReferenced = false;
  state.updateCalls = 0;
  state.stat.mockReset().mockResolvedValue({ isFile: () => true });
  state.unlink.mockReset().mockResolvedValue(undefined);
  state.exists.mockReset().mockResolvedValue({ data: true, error: null });
  state.remove.mockReset().mockResolvedValue({ data: [], error: null });
  state.storageFrom.mockReset().mockReturnValue({
    exists: state.exists,
    remove: state.remove,
  });
});

describe("product image reference validation", () => {
  it("accepts a bundled image only when the safely resolved public file exists", async () => {
    const bundledPath = "/generated-products/test-image.png" as const;

    await expect(assertProductImageExists(bundledPath)).resolves.toBeUndefined();

    expect(state.stat).toHaveBeenCalledWith(
      path.resolve(process.cwd(), "public", "generated-products", "test-image.png"),
    );
    expect(state.storageFrom).not.toHaveBeenCalled();
  });

  it("rejects a missing bundled image and an unsafe image path", async () => {
    state.stat.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "ENOENT" }),
    );

    await expect(
      assertProductImageExists("/products/missing.jpg"),
    ).rejects.toMatchObject({ status: 409, code: "IMAGE_NOT_FOUND" });
    await expect(
      assertProductImageExists(
        "/generated-products/../private.png" as never,
      ),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_IMAGE_PATH" });
  });

  it("checks a local vendor upload in public/vendor-products", async () => {
    await expect(assertProductImageExists(imagePath)).resolves.toBeUndefined();

    expect(state.stat).toHaveBeenCalledWith(
      path.resolve(process.cwd(), "public", "vendor-products", `${hash}.png`),
    );
  });

  it("checks Supabase vendor uploads through Storage exists", async () => {
    state.backend = "supabase";

    await expect(assertProductImageExists(imagePath)).resolves.toBeUndefined();

    expect(state.storageFrom).toHaveBeenCalledWith("vendor-products");
    expect(state.exists).toHaveBeenCalledWith(`${hash}.png`);
    expect(state.stat).not.toHaveBeenCalled();
  });

  it("rejects a missing Supabase upload without touching local files", async () => {
    state.backend = "supabase";
    state.exists.mockResolvedValueOnce({
      data: false,
      error: {
        message: "Object not found",
        status: 404,
        statusCode: "404",
      },
    });

    await expect(assertProductImageExists(imagePath)).rejects.toMatchObject({
      status: 409,
      code: "IMAGE_NOT_FOUND",
    });
    expect(state.stat).not.toHaveBeenCalled();
  });
});

describe("unused vendor-image deletion", () => {
  it("rejects non-content-addressed and traversal paths before reading data", async () => {
    await expect(
      deleteUnusedVendorImage("/vendor-products/../private.png"),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_IMAGE_PATH" });
    await expect(
      deleteUnusedVendorImage(`/generated-products/${hash}.png`),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_IMAGE_PATH" });
    await expect(
      deleteUnusedVendorImage(`/vendor-products/${hash}.jpeg`),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_IMAGE_PATH" });

    expect(state.updateCalls).toBe(0);
    expect(state.unlink).not.toHaveBeenCalled();
  });

  it("keeps images referenced by archived products", async () => {
    state.database = database([
      {
        image: imagePath,
        archived: true,
      } as VendorDatabase["products"][number],
    ]);

    await expect(deleteUnusedVendorImage(imagePath)).rejects.toMatchObject({
      status: 409,
      code: "IMAGE_IN_USE",
    });
    expect(state.unlink).not.toHaveBeenCalled();
  });

  it("keeps images referenced by historical order-item snapshots", async () => {
    state.database = database([], [
      {
        items: [{ image: imagePath }],
      } as unknown as VendorDatabase["orders"][number],
    ]);

    await expect(deleteUnusedVendorImage(imagePath)).rejects.toMatchObject({
      status: 409,
      code: "IMAGE_IN_USE",
    });
    expect(state.unlink).not.toHaveBeenCalled();
  });

  it("deletes only the resolved local content-addressed file", async () => {
    await expect(deleteUnusedVendorImage(imagePath)).resolves.toEqual({
      path: imagePath,
    });

    expect(state.unlink).toHaveBeenCalledWith(
      path.resolve(process.cwd(), "public", "vendor-products", `${hash}.png`),
    );
  });

  it("treats an already-missing local file as a successful retry", async () => {
    state.unlink.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "ENOENT" }),
    );

    await expect(deleteUnusedVendorImage(imagePath)).resolves.toEqual({
      path: imagePath,
    });
  });

  it("checks Supabase references under the mutation lock and uses Storage remove", async () => {
    state.backend = "supabase";

    await expect(deleteUnusedVendorImage(imagePath)).resolves.toEqual({
      path: imagePath,
    });

    expect(state.storageFrom).toHaveBeenCalledWith("vendor-products");
    expect(state.remove).toHaveBeenCalledWith([`${hash}.png`]);
    expect(state.unlink).not.toHaveBeenCalled();
  });

  it("does not delete a Supabase object referenced by a product or order", async () => {
    state.backend = "supabase";
    state.transactionReferenced = true;

    await expect(deleteUnusedVendorImage(imagePath)).rejects.toMatchObject({
      status: 409,
      code: "IMAGE_IN_USE",
    });
    expect(state.remove).not.toHaveBeenCalled();
  });

  it("treats a missing Supabase object as a successful retry", async () => {
    state.backend = "supabase";
    state.remove.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Object not found",
        status: 404,
        statusCode: "404",
      },
    });

    await expect(deleteUnusedVendorImage(imagePath)).resolves.toEqual({
      path: imagePath,
    });
  });
});
