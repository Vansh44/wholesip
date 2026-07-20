# CI/CD — Cloud Build → Cloud Run (per environment)

Push-to-deploy for both environments, driven by [`cloudbuild.yaml`](../cloudbuild.yaml):

| Branch    | Builds & deploys to         | Firebase / DB / bucket                                          |
| --------- | --------------------------- | --------------------------------------------------------------- |
| `staging` | `storemink-web` (staging)   | `storemink-staging` / `storemink-staging` / `storemink-media`   |
| `main`    | `storemink-web-prod` (prod) | `storemink-prod` / `storemink-prod-db` / `storemink-media-prod` |

Flow going forward: `f1` → merge to `staging` (auto-deploys staging, verify) →
merge `staging` to `main` (auto-deploys prod).

---

## Why the first CI build failed

Cloud Run's built-in "Deploy from repository" created a trigger with **no build
config** — it did a bare Dockerfile build with **zero `--build-arg`s**. So
`NEXT_PUBLIC_ROOT_DOMAIN` was empty at build time, and `next build` crashed:

```
Failed to collect page data for /_not-found
TypeError: Invalid URL, input: 'https:'
```

`NEXT_PUBLIC_*` are **baked into the client bundle at build time**, so they must
be passed as Docker build args (only `cloudbuild.yaml` does this). The empty
`ROOT_DOMAIN` produced `PLATFORM_URL = "https:"` → `new URL("https:")` throws.

Two-part fix (both in this commit):

1. **Code safety net** — `lib/store/host.ts` now uses `|| "storemink.com"` (not
   `??`), so an empty env degrades to the apex instead of crashing. Belt-and-
   suspenders; the trigger must still pass the real values.
2. **`cloudbuild.yaml` is now a full build → push → deploy pipeline** with
   per-env substitutions (below). Replace the built-in trigger with two that use
   it.

---

## One-time IAM (Cloud Build service account)

Both triggers run as the Compute Engine default SA
`705863961054-compute@developer.gserviceaccount.com`. It already has
build/push/log perms; grant it deploy perms (idempotent):

```bash
# Deploy to Cloud Run
gcloud projects add-iam-policy-binding storemink-prod \
  --member="serviceAccount:705863961054-compute@developer.gserviceaccount.com" \
  --role="roles/run.admin"

# Act AS the runtime SA (the deploy sets the service to run as storemink-run)
gcloud iam service-accounts add-iam-policy-binding \
  storemink-run@storemink-prod.iam.gserviceaccount.com \
  --project=storemink-prod \
  --member="serviceAccount:705863961054-compute@developer.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

---

## Create the two triggers

The repo uses a 1st-gen GitHub App connection (`Vansh44/storemink`), so plain
`gcloud builds triggers create github` works.

> **`<STAGING_WEB_API_KEY>` / `<PROD_WEB_API_KEY>`** — the Firebase **web**
> apiKey. It's PUBLIC (it ships in the client bundle), so it's fine in a trigger
> config, but it's kept OUT of the tracked repo to avoid GitHub secret-scanning
> alerts. Fetch each from its project:
>
> ```bash
> gcloud auth application-default set-quota-project storemink-prod  # once
> curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" \
>   -H "X-Goog-User-Project: <PROJECT>" \
>   "https://firebase.googleapis.com/v1beta1/projects/<PROJECT>/webApps/-/config"
> ```
>
> (`<PROJECT>` = `storemink-staging` or `storemink-prod`) — or Firebase console →
> Project settings → Your apps → Web app → SDK config.
>
> **Real hardening (do this once per key):** in Google Cloud console →
> APIs & Services → Credentials → the "Browser key", set **Application
> restrictions** = HTTP referrers (your domains) and **API restrictions** =
> Identity Toolkit + Token Service + the Firebase APIs you use. That, not
> secrecy, is what protects a public web key.

### Staging (`staging` → `storemink-web`)

Only the 6 Firebase values differ from the `cloudbuild.yaml` defaults, but we
pass the full set so the trigger is self-documenting:

```bash
gcloud builds triggers create github \
  --project=storemink-prod --region=global \
  --name=storemink-web-staging \
  --repo-owner=Vansh44 --repo-name=storemink \
  --branch-pattern='^staging$' \
  --build-config=cloudbuild.yaml \
  --service-account=projects/storemink-prod/serviceAccounts/705863961054-compute@developer.gserviceaccount.com \
  --substitutions='_IMAGE=asia-south1-docker.pkg.dev/storemink-prod/storemink/web:staging,_SERVICE=storemink-web,_MIN_INSTANCES=0,_DB_CONN=storemink-prod:asia-south1:storemink-staging,_DB_PASSWORD_SECRET=CLOUDSQL_STAGING_APP_PW,_GCS_BUCKET=storemink-media,_FIREBASE_PROJECT_ID=storemink-staging,_FIREBASE_SA_ID=firebase-adminsdk-fbsvc@storemink-staging.iam.gserviceaccount.com,_NEXT_PUBLIC_FIREBASE_API_KEY=<STAGING_WEB_API_KEY>,_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=storemink-staging.firebaseapp.com,_NEXT_PUBLIC_FIREBASE_PROJECT_ID=storemink-staging,_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=storemink-staging.firebasestorage.app,_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=68037646295,_NEXT_PUBLIC_FIREBASE_APP_ID=1:68037646295:web:388ef47d32e39c822b1d92,_NEXT_PUBLIC_ROOT_DOMAIN=staging.storemink.com,_NEXT_PUBLIC_APP_URL=https://staging.storemink.com'
```

### Production (`main` → `storemink-web-prod`)

```bash
gcloud builds triggers create github \
  --project=storemink-prod --region=global \
  --name=storemink-web-prod \
  --repo-owner=Vansh44 --repo-name=storemink \
  --branch-pattern='^main$' \
  --build-config=cloudbuild.yaml \
  --service-account=projects/storemink-prod/serviceAccounts/705863961054-compute@developer.gserviceaccount.com \
  --substitutions='_IMAGE=asia-south1-docker.pkg.dev/storemink-prod/storemink/web:prod,_SERVICE=storemink-web-prod,_MIN_INSTANCES=1,_DB_CONN=storemink-prod:asia-south1:storemink-prod-db,_DB_PASSWORD_SECRET=CLOUDSQL_PROD_APP_PW,_GCS_BUCKET=storemink-media-prod,_FIREBASE_PROJECT_ID=storemink-prod,_FIREBASE_SA_ID=firebase-adminsdk-fbsvc@storemink-prod.iam.gserviceaccount.com,_NEXT_PUBLIC_FIREBASE_API_KEY=<PROD_WEB_API_KEY>,_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=storemink-prod.firebaseapp.com,_NEXT_PUBLIC_FIREBASE_PROJECT_ID=storemink-prod,_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=storemink-prod.firebasestorage.app,_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=705863961054,_NEXT_PUBLIC_FIREBASE_APP_ID=1:705863961054:web:e326046a5f9f7b7de9f54f,_NEXT_PUBLIC_ROOT_DOMAIN=storemink.com,_NEXT_PUBLIC_APP_URL=https://storemink.com'
```

---

## Delete the broken built-in trigger

```bash
gcloud builds triggers delete rmgpgab-storemink-web-asia-south1-Vansh44-storemink--stagiufd \
  --project=storemink-prod --region=global
```

---

## Substitution reference (staging vs prod)

| Substitution                                | Staging                                                             | Production                                                       |
| ------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `_SERVICE`                                  | `storemink-web`                                                     | `storemink-web-prod`                                             |
| `_IMAGE` (tag)                              | `…/storemink/web:staging`                                           | `…/storemink/web:prod`                                           |
| `_MIN_INSTANCES`                            | `0`                                                                 | `1`                                                              |
| `_DB_CONN`                                  | `storemink-prod:asia-south1:storemink-staging`                      | `storemink-prod:asia-south1:storemink-prod-db`                   |
| `_DB_PASSWORD_SECRET`                       | `CLOUDSQL_STAGING_APP_PW`                                           | `CLOUDSQL_PROD_APP_PW`                                           |
| `_GCS_BUCKET`                               | `storemink-media`                                                   | `storemink-media-prod`                                           |
| `_FIREBASE_PROJECT_ID`                      | `storemink-staging`                                                 | `storemink-prod`                                                 |
| `_FIREBASE_SA_ID` (custom-token signer)     | `firebase-adminsdk-fbsvc@storemink-staging.iam.gserviceaccount.com` | `firebase-adminsdk-fbsvc@storemink-prod.iam.gserviceaccount.com` |
| `_NEXT_PUBLIC_FIREBASE_API_KEY`             | `<STAGING_WEB_API_KEY>`                                             | `<PROD_WEB_API_KEY>`                                             |
| `_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         | `storemink-staging.firebaseapp.com`                                 | `storemink-prod.firebaseapp.com`                                 |
| `_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`      | `storemink-staging.firebasestorage.app`                             | `storemink-prod.firebasestorage.app`                             |
| `_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `68037646295`                                                       | `705863961054`                                                   |
| `_NEXT_PUBLIC_FIREBASE_APP_ID`              | `1:68037646295:web:388ef47d32e39c822b1d92`                          | `1:705863961054:web:e326046a5f9f7b7de9f54f`                      |
| `_NEXT_PUBLIC_ROOT_DOMAIN`                  | `staging.storemink.com`                                             | `storemink.com`                                                  |
| `_NEXT_PUBLIC_APP_URL`                      | `https://staging.storemink.com`                                     | `https://storemink.com`                                          |

The Firebase `apiKey` and app id are public (they ship in the client bundle) —
not secrets. Real secrets (`DB_PASSWORD`, `CRON_SECRET`) come from Secret Manager
at deploy time via `--set-secrets`; add `RESEND_API_KEY`, `PAYMENT_CRED_KEY`,
`RAZORPAY_*` there when those features go live.
