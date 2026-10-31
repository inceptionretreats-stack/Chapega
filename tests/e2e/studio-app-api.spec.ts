import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";

const OWNER_EMAIL = process.env.VENDOR_EMAIL ?? "owner@chapega.com";
const OWNER_PASSWORD = process.env.VENDOR_PASSWORD ?? "Chapega@2026";

/** The Chapega Studio app's API contract. It never uses a browser, so one project is enough. */
function onlyOnce() {
  test.skip(test.info().project.name !== "chromium", "API contract; checked on chromium only.");
}

/** A phone: no cookies, no Origin header, like the Flutter app's HTTP client. */
async function phone(baseURL: string | undefined): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL });
}

async function phoneSignIn(app: APIRequestContext, email = OWNER_EMAIL, password = OWNER_PASSWORD) {
  const response = await app.post("/api/studio-app/v1/login", {
    data: {
      email,
      password,
      device: {
        installationId: randomUUID(),
        platform: "android",
        model: "Pixel 8",
        appVersion: "1.0.0+1",
      },
    },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["set-cookie"]).toBeUndefined();
  return (await response.json()) as { token: string; user: { mustChangePassword?: boolean } };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

test("the app's token opens the Studio API as a Bearer token, and only that way", async ({
  baseURL,
}) => {
  onlyOnce();
  const app = await phone(baseURL);
  const { token } = await phoneSignIn(app);
  expect(token).toMatch(/^chapega_app_[A-Za-z0-9_-]{43}$/);

  const bootstrap = await app.get("/api/vendor/chapega/bootstrap", { headers: bearer(token) });
  expect(bootstrap.status()).toBe(200);
  expect((await bootstrap.json()).vendor.slug).toBe("chapega");

  const asCookie = await app.get("/api/vendor/chapega/bootstrap", {
    headers: { cookie: `chapega_vendor_session=${token}` },
  });
  expect(asCookie.status()).toBe(401);

  const session = await app.get("/api/studio-app/v1/session", { headers: bearer(token) });
  expect(session.status()).toBe(200);
  expect((await session.json()).user.email).toBe(OWNER_EMAIL);

  await app.post("/api/studio-app/v1/logout", { headers: bearer(token) });
  const afterLogout = await app.get("/api/studio-app/v1/session", { headers: bearer(token) });
  expect(afterLogout.status()).toBe(401);
  await app.dispose();
});

test("the phone and the browser Studio stay signed in alongside each other", async ({
  page,
  baseURL,
}) => {
  onlyOnce();
  const origin = new URL(baseURL ?? "http://localhost:3100").origin;
  const browserSignIn = () =>
    page.request.post("/api/vendor/login", {
      data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
      headers: { origin },
    });
  expect((await browserSignIn()).status()).toBe(200);
  const app = await phone(baseURL);
  const { token } = await phoneSignIn(app);

  expect((await page.request.get("/api/vendor/chapega/bootstrap")).status()).toBe(200);
  expect((await browserSignIn()).status()).toBe(200);
  expect((await app.get("/api/studio-app/v1/session", { headers: bearer(token) })).status()).toBe(
    200,
  );
  await phoneSignIn(await phone(baseURL));
  expect((await page.request.get("/api/vendor/chapega/bootstrap")).status()).toBe(200);
  expect((await app.get("/api/studio-app/v1/session", { headers: bearer(token) })).status()).toBe(
    200,
  );
  await app.dispose();
});

test("the phone uploads a product photo with its Bearer token", async ({ baseURL }) => {
  onlyOnce();
  const app = await phone(baseURL);
  const { token } = await phoneSignIn(app);
  const photo = await readFile(
    path.join(process.cwd(), "public", "generated-products", "acrylic-sketch-lamp.png"),
  );

  const upload = await app.post("/api/vendor/chapega/uploads", {
    headers: bearer(token),
    multipart: { image: { name: "product.png", mimeType: "image/png", buffer: photo } },
  });
  expect(upload.status()).toBe(201);
  const { image } = (await upload.json()) as { image: { path: string } };
  expect(image.path).toMatch(/^\/vendor-products\//);

  const removed = await app.delete("/api/vendor/chapega/uploads", {
    headers: bearer(token),
    data: { path: image.path },
  });
  expect(removed.status()).toBe(200);
  await app.dispose();
});

test("a password change on the phone keeps the phone and signs the person out of the browser", async ({
  page,
  baseURL,
}) => {
  onlyOnce();
  const origin = new URL(baseURL ?? "http://localhost:3100").origin;
  const runId = Date.now().toString(36);
  const email = `phone-${runId}@example.test`;
  const temporaryPassword = `quiet-harbour-${runId}-lanterns`;
  const chosenPassword = `amber-lights-over-${runId}-the-bay`;

  expect(
    (
      await page.request.post("/api/vendor/login", {
        data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
        headers: { origin },
      })
    ).status(),
  ).toBe(200);
  const added = await page.request.post("/api/vendor/chapega/team", {
    data: { name: "Counter Phone", email, role: "staff", temporaryPassword },
    headers: { origin },
  });
  expect(added.status()).toBe(201);
  const { member } = (await added.json()) as { member: { userId: string } };

  const browser = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { origin },
  });
  expect(
    (
      await browser.post("/api/vendor/login", { data: { email, password: temporaryPassword } })
    ).status(),
  ).toBe(200);
  const app = await phone(baseURL);
  const signedIn = await phoneSignIn(app, email, temporaryPassword);
  expect(signedIn.user.mustChangePassword).toBe(true);

  const changed = await app.post("/api/vendor/chapega/account/password", {
    headers: bearer(signedIn.token),
    data: { currentPassword: temporaryPassword, newPassword: chosenPassword },
  });
  expect(changed.status()).toBe(200);

  const session = await app.get("/api/studio-app/v1/session", { headers: bearer(signedIn.token) });
  expect(session.status()).toBe(200);
  expect((await session.json()).user.mustChangePassword).toBeUndefined();
  expect((await browser.get("/api/vendor/chapega/bootstrap")).status()).toBe(401);

  // Tidy up: the member loses access to the shop.
  expect(
    (
      await page.request.patch(`/api/vendor/chapega/team/${member.userId}`, {
        data: { active: false },
        headers: { origin },
      })
    ).status(),
  ).toBe(200);
  await Promise.all([app.dispose(), browser.dispose()]);
});
