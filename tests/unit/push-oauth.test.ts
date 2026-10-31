import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getPushConfiguration, pushConfigurationProblem } from "@/server/push/config";
import {
  getGoogleAccessToken,
  resetGoogleAccessTokenCache,
  serviceAccountAssertion,
} from "@/server/push/google-oauth";
import { logger, setLogSink } from "@/server/observability/logger";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function serviceAccount(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "service_account",
    project_id: "chapega-studio",
    private_key_id: "key-id-1",
    private_key: privatePem,
    client_email: "push@chapega-studio.iam.gserviceaccount.com",
    ...overrides,
  });
}

function decode(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

const fetchMock = vi.fn();

beforeEach(() => {
  resetGoogleAccessTokenCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", serviceAccount());
  vi.stubEnv("FCM_PROJECT_ID", "");
  vi.stubEnv("FCM_TEST_BASE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setLogSink(null);
});

describe("push configuration", () => {
  it("is off without a key, and reads raw or base64 JSON", () => {
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", "");
    expect(getPushConfiguration()).toBeNull();
    expect(pushConfigurationProblem()).toBeNull();

    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", Buffer.from(serviceAccount()).toString("base64"));
    expect(getPushConfiguration()).toMatchObject({
      projectId: "chapega-studio",
      clientEmail: "push@chapega-studio.iam.gserviceaccount.com",
      oauthTokenUrl: "https://oauth2.googleapis.com/token",
      fcmBaseUrl: "https://fcm.googleapis.com",
    });
  });

  it("turns push off, with a reason, for a broken key", () => {
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", "{not json");
    expect(getPushConfiguration()).toBeNull();
    expect(pushConfigurationProblem()).toMatch(/not a service-account key/);

    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", serviceAccount({ private_key: "nope" }));
    expect(pushConfigurationProblem()).toMatch(/private_key/);

    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", serviceAccount({ type: "authorized_user" }));
    expect(pushConfigurationProblem()).toMatch(/service_account/);
  });

  it("refuses the test endpoint override in production", () => {
    vi.stubEnv("FCM_TEST_BASE_URL", "http://127.0.0.1:9");
    vi.stubEnv("NODE_ENV", "production");
    expect(getPushConfiguration()).toBeNull();
    expect(pushConfigurationProblem()).toMatch(/FCM_TEST_BASE_URL/);
  });
});

describe("Google access token for FCM", () => {
  it("signs an RS256 assertion for the messaging scope that verifies with the public key", () => {
    const assertion = serviceAccountAssertion(getPushConfiguration()!, 1_800_000_000);
    const [header, claims, signature] = assertion.split(".");

    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT", kid: "key-id-1" });
    expect(decode(claims)).toEqual({
      iss: "push@chapega-studio.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${claims}`),
        publicKey,
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
  });

  it("exchanges it once, form-encoded, and shares the token", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ access_token: "access-1", expires_in: 3599, token_type: "Bearer" }),
    );
    const configuration = getPushConfiguration()!;

    const tokens = await Promise.all([
      getGoogleAccessToken(configuration),
      getGoogleAccessToken(configuration),
    ]);
    await getGoogleAccessToken(configuration);

    expect(tokens).toEqual(["access-1", "access-1"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(init.body);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(form.get("assertion")?.split(".")).toHaveLength(3);
  });

  it("backs off for a minute after a failed exchange", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "invalid_grant" }, { status: 400 }));
    const configuration = getPushConfiguration()!;

    await expect(getGoogleAccessToken(configuration)).rejects.toThrow(/400 invalid_grant/);
    await expect(getGoogleAccessToken(configuration)).rejects.toThrow(/backing off/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never lets the key, the assertion or the access token reach the logs", () => {
    const lines: string[] = [];
    setLogSink((_level, line) => lines.push(line));
    const assertion = serviceAccountAssertion(getPushConfiguration()!, 1_800_000_000);

    logger.info("push.debug", {
      private_key: privatePem,
      privateKey: privatePem,
      assertion,
      accessToken: "access-1",
    });

    const output = lines.join("\n");
    expect(output).not.toContain("PRIVATE KEY");
    expect(output).not.toContain(assertion);
    expect(output).not.toContain("access-1");
  });
});
