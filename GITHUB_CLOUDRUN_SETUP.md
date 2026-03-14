# GitHub -> Cloud Run Auto Deploy Setup

This repo includes an auto-deploy workflow at:
- .github/workflows/deploy-cloud-run.yml

It deploys on every push to `main`.

## One-time setup

Set your project:

```bash
gcloud config set project gemini-live-agent-01
```

Create deploy service account:

```bash
gcloud iam service-accounts create github-cloudrun-deployer \
  --display-name="GitHub Cloud Run Deployer"
```

Grant required roles:

```bash
gcloud projects add-iam-policy-binding gemini-live-agent-01 \
  --member="serviceAccount:github-cloudrun-deployer@gemini-live-agent-01.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding gemini-live-agent-01 \
  --member="serviceAccount:github-cloudrun-deployer@gemini-live-agent-01.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding gemini-live-agent-01 \
  --member="serviceAccount:github-cloudrun-deployer@gemini-live-agent-01.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

gcloud projects add-iam-policy-binding gemini-live-agent-01 \
  --member="serviceAccount:github-cloudrun-deployer@gemini-live-agent-01.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

Create Workload Identity Pool and Provider:

```bash
PROJECT_ID="gemini-live-agent-01"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
POOL_ID="github-pool"
PROVIDER_ID="github-provider"
GITHUB_OWNER="dismasdev"
GITHUB_REPO="gemini-live-agent"

gcloud iam workload-identity-pools create "$POOL_ID" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Pool"

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_ID" \
  --display-name="GitHub Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '$GITHUB_OWNER/$GITHUB_REPO'"

gcloud iam service-accounts add-iam-policy-binding \
  "github-cloudrun-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/attribute.repository/$GITHUB_OWNER/$GITHUB_REPO"
```

Prepare Secret Manager value used at deploy time:

```bash
gcloud secrets create GOOGLE_API_KEY --replication-policy=automatic || true
echo -n "YOUR_ROTATED_GOOGLE_API_KEY" | gcloud secrets versions add GOOGLE_API_KEY --data-file=-
```

## GitHub repository secrets

Set these repository secrets in GitHub:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

Value for `GCP_WORKLOAD_IDENTITY_PROVIDER`:

```text
projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider
```

Value for `GCP_SERVICE_ACCOUNT`:

```text
github-cloudrun-deployer@gemini-live-agent-01.iam.gserviceaccount.com
```

## Verify deployment

Push to main:

```bash
git push origin main
```

Then check:

- GitHub Actions tab: workflow `Deploy to Cloud Run`
- Cloud Run service: `opencolabo` in `us-central1`
- Latest revision and URL:

```bash
gcloud run services describe opencolabo --region us-central1 --format='value(status.latestReadyRevisionName,status.url)'
```
