import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";

export const apiOrigin = "http://127.0.0.1:3001";
export const webOrigin = "http://127.0.0.1:3000";
export const fixtureOrigin = "http://127.0.0.1:54321";
export const mutationHeaders = { Origin: webOrigin };

export async function apiSignIn(request: APIRequestContext, email = `${randomUUID()}@example.com`) {
  expect((await request.post(apiOrigin + "/api/auth/magic-link", {
    headers: mutationHeaders, data: { email },
  })).status()).toBe(200);
  const { link } = await (await request.get(fixtureOrigin + "/test/inbox?email=" + email)).json();
  const callback = new URL(link);
  callback.host = new URL(apiOrigin).host;
  expect((await request.get(callback.toString(), { maxRedirects: 0 })).status()).toBe(303);
  return email;
}
