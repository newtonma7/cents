import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { emptyDraftInput } from "@cents/contracts";
import { fixtureOrigin, mutationHeaders, webOrigin } from "./support/api";

test("invalid startup configuration exits without printing configuration values", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "apps/api/src/main.ts"], {
    env: {
      ...process.env, PORT: "3003", NEXT_PUBLIC_SITE_URL: webOrigin,
      NEXT_PUBLIC_SUPABASE_URL: "file:///private-provider-payload", NEXT_PUBLIC_SUPABASE_ANON_KEY: "private-provider-key",
    },
    encoding: "utf8", timeout: 5000,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Invalid API configuration.");
  expect(result.stderr).not.toContain("private-provider-payload");
  expect(result.stderr).not.toContain("private-provider-key");
});

test("unexpected HTTP 500 diagnostics correlate safely without logging request data", async ({ request }) => {
  const endpoint = "http://127.0.0.1:3003";
  const child = spawn(process.execPath, ["--import", "tsx", "apps/api/src/main.ts"], {
    env: {
      ...process.env, PORT: "3003", NEXT_PUBLIC_SITE_URL: webOrigin,
      NEXT_PUBLIC_SUPABASE_URL: fixtureOrigin, NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  child.stdout.on("data", (chunk) => { diagnostics += String(chunk); });
  child.stderr.on("data", (chunk) => { diagnostics += String(chunk); });
  const stopped = new Promise<void>((resolve, reject) => {
    child.once("exit", () => resolve());
    child.once("error", reject);
  });
  const email = `${randomUUID()}@example.com`;
  const privateQuery = randomUUID();
  const privateBody = randomUUID();
  const privateCookie = randomUUID();
  const privateAuthorization = randomUUID();
  try {
    await expect.poll(async () => {
      try { return (await request.get(endpoint + "/healthz")).status(); } catch { return 0; }
    }).toBe(200);
    await request.post(fixtureOrigin + "/test/auth", { data: {} });
    expect((await request.post(endpoint + "/api/auth/magic-link", {
      headers: mutationHeaders, data: { email },
    })).status()).toBe(200);
    const { link } = await (await request.get(fixtureOrigin + "/test/inbox?email=" + email)).json();
    const callback = new URL(link);
    callback.host = "127.0.0.1:3003";
    expect((await request.get(callback.toString(), { maxRedirects: 0 })).status()).toBe(303);
    const session = await request.storageState();
    const cookies = session.cookies.filter((cookie) => cookie.domain === "127.0.0.1");
    expect(cookies.length).toBeGreaterThan(0);
    await request.post(fixtureOrigin + "/test/fault", { data: { mode: "invalid-unrelated" } });
    const id = randomUUID();
    expect((await request.post(endpoint + "/api/listings", {
      headers: mutationHeaders,
      data: { id, fields: { ...emptyDraftInput, title: privateBody } },
    })).status()).toBe(201);
    const response = await request.get(`${endpoint}/api/listings/${id}?private=${privateQuery}`, {
      headers: {
        Authorization: `Bearer ${privateAuthorization}`,
        Cookie: [...cookies.map(({ name, value }) => `${name}=${value}`), `private=${privateCookie}`].join("; "),
      },
    });
    expect(response.status()).toBe(500);
    expect(await response.json()).toEqual({ kind: "error", message: "We could not complete this request. Try again." });
    const requestId = response.headers()["x-request-id"];
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    await expect.poll(() => diagnostics).toContain('"event":"api.unexpected_error"');
    const entry = diagnostics.split(/\r?\n/).find((line) => line.includes('"event":"api.unexpected_error"'));
    expect(entry).toBeDefined();
    expect(JSON.parse(entry ?? "{}")).toEqual({
      event: "api.unexpected_error", requestId, errorCategory: "unexpected_error",
    });
    expect(diagnostics.trim()).toBe(entry);
    for (const secret of [email, privateQuery, privateBody, privateCookie, privateAuthorization, id, ...cookies.map(({ value }) => value)]) {
      expect(diagnostics).not.toContain(secret);
    }
  } finally {
    await request.post(fixtureOrigin + "/test/auth", { data: {} });
    child.kill("SIGTERM");
    await stopped;
  }
  expect(child.exitCode).toBe(0);
});

test("real SDK refresh diagnostics do not log provider bodies or session tokens", async ({ request }) => {
  const endpoint = "http://127.0.0.1:3003";
  const child = spawn(process.execPath, ["--import", "tsx", "apps/api/src/main.ts"], {
    env: {
      ...process.env, PORT: "3003", NEXT_PUBLIC_SITE_URL: webOrigin,
      NEXT_PUBLIC_SUPABASE_URL: fixtureOrigin, NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  child.stdout.on("data", (chunk) => { diagnostics += String(chunk); });
  child.stderr.on("data", (chunk) => { diagnostics += String(chunk); });
  const stopped = new Promise<void>((resolve, reject) => {
    child.once("exit", () => resolve());
    child.once("error", reject);
  });
  try {
    await expect.poll(async () => {
      try { return (await request.get(endpoint + "/healthz")).status(); } catch { return 0; }
    }).toBe(200);
    await request.post(fixtureOrigin + "/test/auth", { data: { session: "expired" } });
    const email = `${randomUUID()}@example.com`;
    expect((await request.post(endpoint + "/api/auth/magic-link", { headers: mutationHeaders, data: { email } })).status()).toBe(200);
    const { link } = await (await request.get(fixtureOrigin + "/test/inbox?email=" + email)).json();
    const callback = new URL(link);
    callback.host = "127.0.0.1:3003";
    expect((await request.get(callback.toString(), { maxRedirects: 0 })).status()).toBe(303);
    const before = await request.storageState();
    await request.post(fixtureOrigin + "/test/auth", { data: { fault: "refresh-invalid" } });
    expect((await request.get(endpoint + "/api/session")).status()).toBe(401);
    await expect.poll(() => diagnostics).toContain("Provider request failed.");
    expect(diagnostics).toContain("refresh_token_not_found");
    expect(diagnostics).not.toContain("private-provider-payload");
    expect(diagnostics).not.toContain(email);
    for (const cookie of before.cookies) expect(diagnostics).not.toContain(cookie.value);
  } finally {
    await request.post(fixtureOrigin + "/test/auth", { data: {} });
    child.kill("SIGTERM");
    await stopped;
  }
  expect(child.exitCode).toBe(0);
});
