# GCP Migration — Phase 4: Vercel → Cloud Run

> Hosting migration runbook. The **code** (containerization) is done and
> committed; the rest is infrastructure you provision with `gcloud`. Do it in
> parallel with Vercel and cut DNS over only once proven — fully reversible.
>
> Project `storemink-prod`, region `asia-south1` (Mumbai) assumed throughout.

## What's already in the repo (Phase 4 code)

- `next.config.ts` → `output: "standalone"` (self-contained server bundle; ignored by Vercel).
- `Dockerfile` — multi-stage, Debian-slim, non-root, listens on `$PORT` (8080). Bakes `NEXT_PUBLIC_*` at build; server secrets stay runtime-only.
- `.dockerignore` — small context; **keeps `brand/tasks/*.md`** (read at runtime by the AI actions).
- `cloudbuild.yaml` — builds `linux/amd64` in-cloud and pushes to Artifact Registry.

Verified: `npm run build` produces `.next/standalone/server.js` with `brand/tasks` and `sharp` traced in.

> **⚠ Architecture:** Cloud Run runs `linux/amd64`. Build with Cloud Build (below)
> or, if using local Docker on an Apple-Silicon Mac, you MUST pass
> `docker build --platform linux/amd64` or the `sharp` binary won't run.

## Runtime env split (from the code audit)

- **Build args** (public, inlined into the client bundle): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_NOINDEX` (optional).
- **Runtime plain env** (non-secret): `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCS_BUCKET`, `GEMINI_MODEL` (opt), `RESEND_FROM_DOMAIN`, plus the `NEXT_PUBLIC_*` again (some run server-side, e.g. `ROOT_DOMAIN` in `lib/store/host.ts`).
- **Runtime secrets** (Secret Manager): `SUPABASE_SERVICE_ROLE_KEY`, `PAYMENT_CRED_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CRON_SECRET`, `GOOGLE_SEARCH_CONSOLE_CREDENTIALS` (opt), `INDEXNOW_KEY` (opt).
- **No longer needed on Cloud Run** (the default service account provides ADC): `GEMINI_API_KEY` (→ Vertex), `GCP_SA_KEY` (→ default SA signs GCS video URLs via IAM). `VERCEL_URL` is Vercel-only.

## Steps

### 1. Enable APIs
```bash
gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com \
  certificatemanager.googleapis.com compute.googleapis.com
```

### 2. Artifact Registry repo
```bash
gcloud artifacts repositories create storemink \
  --repository-format=docker --location=asia-south1
```

### 3. Runtime service account (this is what replaces the API keys)
```bash
gcloud iam service-accounts create storemink-run --display-name="StoreMink Cloud Run"
SA=storemink-run@storemink-prod.iam.gserviceaccount.com
for role in roles/aiplatform.user roles/secretmanager.secretAccessor \
            roles/iam.serviceAccountTokenCreator; do
  gcloud projects add-iam-policy-binding storemink-prod \
    --member="serviceAccount:$SA" --role="$role"
done
# Storage: write to the media bucket + sign video URLs (tokenCreator above)
gcloud storage buckets add-iam-policy-binding gs://storemink-media \
  --member="serviceAccount:$SA" --role=roles/storage.objectAdmin
```
`aiplatform.user` → Vertex works with no API key. `objectAdmin` + `tokenCreator` → GCS uploads AND signed video URLs work with no `GCP_SA_KEY`.

### 4. Secrets → Secret Manager
```bash
# one per secret; repeat for each name in the "Runtime secrets" list
printf %s "$VALUE" | gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --data-file=-
# accessor role already granted to the SA in step 3
```

### 5. Build & push the image (Cloud Build — amd64, no local Docker)
```bash
gcloud builds submit --config cloudbuild.yaml --substitutions=\
_NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co,\
_NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>,\
_NEXT_PUBLIC_ROOT_DOMAIN=storemink.com,\
_NEXT_PUBLIC_APP_URL=https://storemink.com
```

### 6. Deploy to Cloud Run
```bash
gcloud run deploy storemink-web \
  --image=asia-south1-docker.pkg.dev/storemink-prod/storemink/web:latest \
  --region=asia-south1 --service-account=$SA \
  --allow-unauthenticated --port=8080 \
  --cpu=1 --memory=1Gi --min-instances=1 --max-instances=10 \
  --set-env-vars=GCP_PROJECT_ID=storemink-prod,GCP_LOCATION=global,GCS_BUCKET=storemink-media,NEXT_PUBLIC_ROOT_DOMAIN=storemink.com,NEXT_PUBLIC_APP_URL=https://storemink.com,NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co,NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>,RESEND_FROM_DOMAIN=<domain> \
  --set-secrets=SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,PAYMENT_CRED_KEY=PAYMENT_CRED_KEY:latest,RAZORPAY_KEY_ID=RAZORPAY_KEY_ID:latest,RAZORPAY_KEY_SECRET=RAZORPAY_KEY_SECRET:latest,RAZORPAY_WEBHOOK_SECRET=RAZORPAY_WEBHOOK_SECRET:latest,RESEND_API_KEY=RESEND_API_KEY:latest,CRON_SECRET=CRON_SECRET:latest
```
`min-instances=1` avoids cold starts (the middleware + Supabase session check runs per request). Tune later.

### 7. Smoke-test BEFORE DNS (the Host-header trick)
`proxy.ts` routes by Host, and a raw `*.run.app` host is treated as an unknown
custom domain. So test with an explicit Host header:
```bash
URL=$(gcloud run services describe storemink-web --region=asia-south1 --format='value(status.url)')
curl -sI -H "Host: storemink.com"        $URL/            # platform landing
curl -sI -H "Host: wholesip.storemink.com" $URL/shop       # a store storefront
```
Check Cloud Logging (Phase 2's structured logs now auto-ingest here) + Error Reporting for issues.

### 8. Wildcard domain `*.storemink.com` (the involved part)
Cloud Run domain mapping has **no wildcard support**, so front it with an
External Application Load Balancer + Certificate Manager wildcard cert:
1. **Certificate Manager**: a Google-managed cert for `storemink.com` **and**
   `*.storemink.com` via **DNS authorization** (add the CNAME it gives you).
2. **Serverless NEG** → the `storemink-web` Cloud Run service.
3. **Backend service** → NEG; **URL map** → backend; **target HTTPS proxy** (attach the cert); **global forwarding rule** (reserve a static IP).
4. **DNS**: point `storemink.com` and `*.storemink.com` A/AAAA at the LB IP.

Keep Vercel live throughout; flip DNS only when curl tests pass. **Rollback = revert DNS to Vercel.**

### 9. Cron jobs → Cloud Scheduler (replaces `vercel.json` crons)
Do this at cutover (don't double-run with Vercel crons). For each of
`send-emails`, `plan-expiry`, `expire-pending-payments`:
```bash
gcloud scheduler jobs create http cron-send-emails \
  --location=asia-south1 --schedule="0 3 * * *" \
  --uri="https://storemink.com/api/cron/send-emails" \
  --http-method=GET \
  --headers="Authorization=Bearer <CRON_SECRET>"
```
Then delete the `crons` block from `vercel.json`. (Consider OIDC auth instead of
the bearer secret once stable.)

## Notes carried forward
- **Middleware now runs in Node** (standalone), not an edge runtime — this
  removes the Phase 6 edge-signing concern: `firebase-admin` can run in
  `proxy.ts` on Cloud Run if we choose.
- Cloud Run filesystem is read-only except `/tmp`; the app only writes to object
  storage, so this is fine.
- Once traffic is on Cloud Run, Phase 2 logging/Error Reporting is fully live and
  Phase 5 (Cloud SQL) can connect over the VPC/Cloud SQL connector.
