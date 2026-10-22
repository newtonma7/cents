import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const messages = new Map();
const pendingTokens = new Map();
const accessTokens = new Map();
const refreshTokens = new Map();
const sellers = new Map();
const listings = new Map();
let messageNumber = 0;
let nextInsertFault = null;

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sellerFor(email) {
  if (sellers.has(email)) {
    return sellers.get(email);
  }

  const now = new Date().toISOString();
  const digest = createHash("sha256").update(email).digest("hex");
  const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  const seller = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: now,
    confirmed_at: now,
    last_sign_in_at: now,
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { email, email_verified: true, sub: id },
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  };
  sellers.set(email, seller);
  return seller;
}

function sessionFor(seller) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({
      aud: "authenticated",
      exp: now + 3600,
      iat: now,
      iss: "http://127.0.0.1:54321/auth/v1",
      role: "authenticated",
      sub: seller.id,
      email: seller.email,
      session_id: randomUUID(),
    }),
    "test-signature",
  ].join(".");
  const refreshToken = randomUUID();
  accessTokens.set(accessToken, seller);
  refreshTokens.set(refreshToken, seller);

  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: refreshToken,
    user: seller,
  };
}

function bearerToken(request) {
  const authorization = request.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:54321");

  if (url.pathname === "/health") {
    response.writeHead(200).end("ok");
    return;
  }

  if (url.pathname === "/test/fault" && request.method === "POST") {
    const body = await readJson(request);
    nextInsertFault = body.mode;
    json(response, 200, {});
    return;
  }

  if (url.pathname === "/test/inbox" && request.method === "GET") {
    const message = messages.get(url.searchParams.get("email"));
    if (!message) {
      json(response, 404, { message: "No message" });
      return;
    }
    json(response, 200, message);
    return;
  }

  if (url.pathname === "/auth/v1/otp" && request.method === "POST") {
    const body = await readJson(request);
    const email = body.email;
    if (typeof email !== "string") {
      json(response, 422, { message: "Email is required" });
      return;
    }

    const tokenHash = `test-token-${++messageNumber}`;
    pendingTokens.set(tokenHash, email);
    const redirectTo =
      url.searchParams.get("redirect_to") ??
      body.redirect_to ??
      "http://127.0.0.1:3000/auth/confirm";
    const confirmation = new URL(redirectTo);
    confirmation.searchParams.set("token_hash", tokenHash);
    confirmation.searchParams.set("type", "email");
    messages.set(email, { link: confirmation.toString() });
    json(response, 200, {});
    return;
  }

  if (url.pathname === "/auth/v1/verify" && request.method === "POST") {
    const body = await readJson(request);
    const email = pendingTokens.get(body.token_hash);
    if (!email || body.type !== "email") {
      json(response, 403, { message: "Invalid or expired token" });
      return;
    }

    pendingTokens.delete(body.token_hash);
    json(response, 200, sessionFor(sellerFor(email)));
    return;
  }

  if (url.pathname === "/rest/v1/canonical_listings") {
    const seller = accessTokens.get(bearerToken(request));
    if (!seller) {
      json(response, 401, { message: "Invalid token" });
      return;
    }

    if (request.method === "POST") {
      const body = await readJson(request);
      const fault = nextInsertFault;
      nextInsertFault = null;
      if (fault === "before-commit") {
        json(response, 503, { message: "Temporary insert failure" });
        return;
      }
      if (listings.has(body.id)) {
        json(response, 409, { code: "23505", message: "Duplicate listing" });
        return;
      }
      const now = new Date().toISOString();
      const listing = {
        id: body.id,
        seller_id: seller.id,
        title: body.title,
        description: body.description,
        garment_type: null,
        size_system: null,
        size_label: null,
        condition: null,
        brand: null,
        price_usd_cents: null,
        revision: fault === "invalid-unrelated" ? 0 : 1,
        created_at: now,
        updated_at: now,
      };
      listings.set(body.id, listing);
      if (fault === "after-commit") {
        response.destroy();
        return;
      }
      response.writeHead(201).end();
      return;
    }

    if (request.method === "GET") {
      const requestedId = url.searchParams.get("id")?.replace(/^eq\./, "");
      const owned = [...listings.values()].filter(
        (listing) => listing.seller_id === seller.id,
      );
      const selected = requestedId
        ? owned.filter((listing) => listing.id === requestedId)
        : owned.sort((left, right) => right.created_at.localeCompare(left.created_at));
      const acceptsObject = request.headers.accept?.includes("vnd.pgrst.object");
      if (acceptsObject && selected.length === 0) {
        json(response, 406, { code: "PGRST116", message: "No rows found" });
        return;
      }
      const columns = url.searchParams.get("select")?.split(",");
      const rows = columns
        ? selected.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])))
        : selected;
      json(response, 200, acceptsObject ? rows[0] : rows);
      return;
    }
  }

  if (url.pathname === "/auth/v1/user" && request.method === "GET") {
    const seller = accessTokens.get(bearerToken(request));
    if (!seller) {
      json(response, 401, { message: "Invalid token" });
      return;
    }
    json(response, 200, seller);
    return;
  }

  if (
    url.pathname === "/auth/v1/token" &&
    url.searchParams.get("grant_type") === "refresh_token" &&
    request.method === "POST"
  ) {
    const body = await readJson(request);
    const seller = refreshTokens.get(body.refresh_token);
    if (!seller) {
      json(response, 401, { message: "Invalid refresh token" });
      return;
    }
    json(response, 200, sessionFor(seller));
    return;
  }

  json(response, 404, { message: "Not found" });
});

server.listen(54321, "127.0.0.1");
