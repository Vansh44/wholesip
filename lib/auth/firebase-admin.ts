// Firebase Admin SDK singleton (GCP migration Phase 6 — Auth → Identity
// Platform). Server-only: used by the session-cookie helpers, the custom-claims
// helpers, and — because Next.js 16 `proxy.ts` runs on the NODE runtime by
// default — by the proxy middleware too. (This supersedes the plan's "verify at
// the edge with jose" note: there is no edge runtime to work around here.)
//
// DORMANT until configured. Credentials resolve in this order:
//   1. Explicit service account via FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL
//      + FIREBASE_PRIVATE_KEY (e.g. Vercel, local dev).
//   2. Application Default Credentials (automatic on Cloud Run / GCP).
// When neither is available, getFirebaseAdminAuth() returns null so callers can
// gracefully fall back to the still-live Supabase path during the migration.

import {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let _auth: Auth | null | undefined;

function initApp(): App | null {
  // Reuse an already-initialised default app (hot reload / repeated imports).
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Private keys in env carry literal "\n" escapes — restore real newlines.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  try {
    if (projectId && clientEmail && privateKey) {
      return initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        projectId,
      });
    }
    // Application Default Credentials (Cloud Run default service account).
    if (
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GCP_PROJECT_ID
    ) {
      return initializeApp({
        credential: applicationDefault(),
        projectId: process.env.GCP_PROJECT_ID || projectId,
      });
    }
  } catch (err) {
    console.error("firebase-admin init failed:", err);
    return null;
  }
  return null;
}

/**
 * The Firebase Admin Auth instance, or null when Identity Platform isn't
 * configured yet (migration-safe: callers fall back to Supabase). Memoised —
 * including the null result, so we don't retry init on every call.
 */
export function getFirebaseAdminAuth(): Auth | null {
  if (_auth !== undefined) return _auth;
  const app = initApp();
  _auth = app ? getAuth(app) : null;
  return _auth;
}

/** True once Identity Platform credentials are available. */
export function isFirebaseAdminConfigured(): boolean {
  return getFirebaseAdminAuth() !== null;
}
