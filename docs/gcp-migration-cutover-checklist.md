# GCP Cutover Checklist — going live on Google Cloud

> The go-live checklist to fully cut StoreMink from **Supabase + Vercel** to
> **GCP** (Cloud SQL + Identity Platform + GCS + Cloud Run). Staging is already
> fully migrated and verified; this tracks the remaining **prod cutover**.
>
> Detailed runbooks: [`gcp-migration-phase4-cloud-run.md`](gcp-migration-phase4-cloud-run.md)
> (Vercel→Cloud Run) and [`gcp-migration-phase5-6.md`](gcp-migration-phase5-6.md)
> (DB + Auth).

## Where we are (done + verified on staging)

- ✅ **Phase 5 (data → Cloud SQL/Drizzle)** — every DB read/write goes through
  `lib/db` (Drizzle). Only Supabase Storage (media) remains, by design.
- ✅ **Phase 6 (auth → Identity Platform)** — verified end-to-end on staging:
  signup, email/password login, "Continue with Google", forgot→reset password,
  staff invite → first login.
- ✅ **`uuid→text` uid-column migration** applied + verified on staging
  (`supabase/phase6_01_uid_columns_to_text.sql`) — Firebase uids are strings.
- ▶ **Remaining:** provision prod, migrate prod data + users + media, deploy
  Cloud Run, flip DNS, decommission.

**Key topology reminder:** the infra (Cloud SQL instances, GCS buckets, Cloud
Run, Vertex) lives in the **`storemink-prod` GCP project**; the **Identity
Platform project is separate per env** (`storemink-staging` for staging, a prod
project for prod — CODEBASE.md §7). Isolation = separate _instances/buckets_, not
separate projects.

---

## 1. Prep — no downtime, do alongside the live site

**Code**

- [ ] Fix [`lib/auth/firebase-admin.ts`](../lib/auth/firebase-admin.ts) so the ADC
      path prefers `FIREBASE_PROJECT_ID` over `GCP_PROJECT_ID`, so the Firebase
      project is never conflated with the infra project on Cloud Run.
- [ ] Refresh [`gcp-migration-phase4-cloud-run.md`](gcp-migration-phase4-cloud-run.md)
      — it's stale (still lists `SUPABASE_*` build args + "Supabase session
      check"). Real env is now `DB_*` + `FIREBASE_*` + the Cloud SQL connector.

**Provision prod GCP**

- [ ] **Prod Cloud SQL instance** (POSTGRES_17, asia-south1, IAM auth, db
      `storemink`) — separate instance from staging.
- [ ] **Prod Identity Platform / Firebase project** — separate from staging.
      Enable Email/Password, Email-link, Google, Phone; reCAPTCHA; **SMS region
      allowlist** (NOT `allowlistOnly:{}`); authorized domains; Google OAuth web
      client. (3 gotchas hit on staging: ADC quota project must match, enable
      `recaptchaenterprise.googleapis.com`, allowlist SMS regions.)
- [ ] **Prod media GCS bucket** (e.g. `storemink-media-prod`) — public, uniform
      access, CORS for video PUT. Keeps prod media isolated from staging's
      `storemink-media`, mirroring the two DB instances. _(origin of this list.)_
- [ ] **Prod secrets → Secret Manager:** `DB_PASSWORD`, `FIREBASE_PRIVATE_KEY`
      (+`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PROJECT_ID`), `PAYMENT_CRED_KEY`,
      `RAZORPAY_KEY_ID`/`_KEY_SECRET`/`_WEBHOOK_SECRET`, `RESEND_API_KEY`,
      `CRON_SECRET`.
- [ ] **Cloud Run runtime SA + roles:** `aiplatform.user`,
      `secretmanager.secretAccessor`, `storage.objectAdmin` (prod bucket),
      **`cloudsql.client`**, `iam.serviceAccountTokenCreator`.

**Build + edge (in parallel with Vercel)**

- [ ] Build the Cloud Run image against the **migrated** stack — the current
      staging image predates Phase 5/6 (built against Supabase); rebuild.
- [ ] **External HTTPS Load Balancer + Certificate Manager wildcard cert** for
      `storemink.com` and `*.storemink.com` (Cloud Run has no native wildcard
      domain mapping).

---

## 2. Dry run — prod Cloud SQL, before the window

- [ ] Apply the schema to prod Cloud SQL in order:
      `drizzle/manual/0000_compat_setup.sql` → `0001_schema.sql` →
      `0002_postflight.sql`.
- [ ] Apply `supabase/phase6_01_uid_columns_to_text.sql` **as `postgres`** (uid
      columns → text; entity PKs + `store_id` stay uuid).
- [ ] Full app pass against prod Cloud SQL (Host-header trick on the Cloud Run
      URL: `curl -H "X-Forwarded-Host: storemink.com" <run-url>/`).

---

## 3. Cutover window — short downtime

**Data**

- [ ] Final Supabase `pg_dump --data-only` → load into prod Cloud SQL (per-table
      `DISABLE TRIGGER USER` + `--single-transaction`; drop `auth.users` FKs —
      see the Phase 5 load gotchas). Supabase uuid uids load into the text
      columns fine.
- [ ] **User import** into prod Identity Platform — `admin.auth().importUsers()`
      preserving each **uid + bcrypt** hash (from the Supabase `auth.users`
      dump). Imported uuid uids match the text `admins.id`/`users.id`, so every
      FK stays intact and no passwords reset.

**Media**

- [ ] Backfill existing media Supabase Storage → prod GCS bucket **+ rewrite DB
      URLs**.
- [ ] Migrate the OG-image cache bucket ([`app/api/og-image/route.ts`](../app/api/og-image/route.ts)
      still uses Supabase Storage).

**Deploy + DNS**

- [ ] Deploy Cloud Run: `--add-cloudsql-instances=<prod-instance>`, runtime SA,
      the **decoupled** env (explicit `FIREBASE_*` for the prod Firebase project + `GCP_PROJECT_ID=<infra project>`), `--set-secrets`.
- [ ] Crons → **Cloud Scheduler** (`send-emails`, `plan-expiry`,
      `expire-pending-payments`), then delete the `crons` block from `vercel.json`.
- [ ] Flip DNS `storemink.com` + `*.storemink.com` → the LB IP. **Keep Vercel
      live as rollback.**

---

## 4. After — verify, then decommission

- [ ] Smoke-test prod: signup, login (email + Google), a storefront, a dashboard,
      place an order, upload an image + a video.
- [ ] Remove the Supabase Storage fallback from the 3 upload routes
      (`api/upload`, `api/upload/sign-video`, `api/og-image`) once the backfill is
      confirmed.
- [ ] Drop `NEXT_PUBLIC_SUPABASE_*` + `SUPABASE_SERVICE_ROLE_KEY` from all env.
- [ ] Delete the Supabase project. Turn off Vercel.

**Hygiene (do sooner, not blocking)**

- [ ] Rotate the staging DB `app` password (pasted in chat a few times):
      `gcloud sql users set-password app --instance=storemink-staging`, then
      update `.env` + Secret Manager (`CLOUDSQL_STAGING_APP_PW`).
- [ ] Delete staging test users (`smoketest@storemink.com`, the `dummy`/`test`
      stores' owners, etc.) from the staging Identity Platform.

---

## Rollback

- **Hosting:** point DNS back to Vercel.
- **Database:** point `lib/db` env back at Supabase Postgres (the Drizzle code +
  `auth.uid()` shim work against either).

Both stay reversible until the Supabase project is deleted.
