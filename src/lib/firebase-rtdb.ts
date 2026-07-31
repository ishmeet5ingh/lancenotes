import nodeCrypto from "crypto";

const tokenUrl = "https://oauth2.googleapis.com/token";
const testRoot = "lancenotes_test";
const migrationPreviewRoot = "lancenotes_migration_preview";
const appRoot = "lancenotes_app";

type FirebaseToken = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function getFirebaseConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const databaseUrl = process.env.FIREBASE_DATABASE_URL?.trim().replace(/\/$/, "");
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const missing = [
    ["FIREBASE_PROJECT_ID", projectId],
    ["FIREBASE_DATABASE_URL", databaseUrl],
    ["FIREBASE_CLIENT_EMAIL", clientEmail],
    ["FIREBASE_PRIVATE_KEY", privateKey]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing Firebase environment variables: ${missing.join(", ")}`);
  }

  return {
    projectId: projectId as string,
    databaseUrl: databaseUrl as string,
    clientEmail: clientEmail as string,
    privateKey: privateKey as string
  };
}

function createServiceAccountJwt() {
  const { clientEmail, privateKey } = getFirebaseConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
    aud: tokenUrl,
    iat: now,
    exp: now + 3600
  };
  const unsignedToken = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = nodeCrypto.createSign("RSA-SHA256").update(unsignedToken).sign(privateKey);

  return `${unsignedToken}.${base64Url(signature)}`;
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.accessToken;
  }

  const assertion = createServiceAccountJwt();
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const data = (await response.json()) as FirebaseToken & { error?: string; error_description?: string };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Unable to authenticate with Firebase");
  }

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000
  };
  return cachedToken.accessToken;
}

function encodePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function assertSafePath(path: string) {
  const normalized = path.replace(/^\/+/, "");
  const allowedRoots = [testRoot, migrationPreviewRoot, appRoot];
  if (!allowedRoots.some((root) => normalized === root || normalized.startsWith(`${root}/`))) {
    throw new Error(`Firebase writes are restricted to /${allowedRoots.join(" or /")}`);
  }
  return normalized;
}

export async function firebaseRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const safePath = assertSafePath(path);
  const { databaseUrl } = getFirebaseConfig();
  const accessToken = await getAccessToken();
  const response = await fetch(`${databaseUrl}/${encodePath(safePath)}.json`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const data = (await response.json().catch(() => null)) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data?.error || "Firebase Realtime Database request failed");
  }

  return data as T;
}

export const firebaseAppPaths = {
  root: appRoot,
  projects: `${appRoot}/projects`,
  users: `${appRoot}/users`,
  metadata: `${appRoot}/metadata`
};

export const firebaseTestRequest = firebaseRequest;

export function createFirebaseTestPath() {
  return `${testRoot}/sample-${Date.now()}-${nodeCrypto.randomUUID()}`;
}

export function createFirebaseMigrationPreviewPath() {
  return `${migrationPreviewRoot}/preview-${Date.now()}-${nodeCrypto.randomUUID()}`;
}
