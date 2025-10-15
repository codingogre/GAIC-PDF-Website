# Google Cloud Run Deployment Guide

This guide provides step-by-step instructions to deploy the GAIC PDF Website to Google Cloud Run.

## Prerequisites

1. **Install Google Cloud SDK**
   ```bash
   # macOS
   brew install --cask google-cloud-sdk

   # Or download from: https://cloud.google.com/sdk/docs/install
   ```

2. **Authenticate with Google Cloud**
   ```bash
   gcloud auth login
   ```

3. **Set your project ID**
   ```bash
   # Replace YOUR_PROJECT_ID with your actual GCP project ID
   export PROJECT_ID="YOUR_PROJECT_ID"
   gcloud config set project $PROJECT_ID
   ```

4. **Enable required APIs**
   ```bash
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable run.googleapis.com
   gcloud services enable artifactregistry.googleapis.com
   ```

## Deployment Steps

### Step 1: Create Artifact Registry Repository (one-time setup)

```bash
# Create a Docker repository in Artifact Registry
gcloud artifacts repositories create gaig-docker-repo \
    --repository-format=docker \
    --location=us-central1 \
    --description="Docker repository for GAIC applications"
```

### Step 2: Configure Docker Authentication

```bash
# Configure Docker to authenticate with Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev
```

### Step 3: Build and Push Container Image

```bash
# Build the container image
docker build -t us-central1-docker.pkg.dev/$PROJECT_ID/gaig-docker-repo/gaig-pdf-website:latest .

# Push to Artifact Registry
docker push us-central1-docker.pkg.dev/$PROJECT_ID/gaig-docker-repo/gaig-pdf-website:latest
```

**Alternative: Build directly in Cloud Build**
```bash
# This builds the image in the cloud (no local Docker needed)
gcloud builds submit --tag us-central1-docker.pkg.dev/$PROJECT_ID/gaig-docker-repo/gaig-pdf-website:latest
```

### Step 4: Deploy to Cloud Run (Public Access)

```bash
# Deploy with environment variables - ALLOWS PUBLIC INTERNET ACCESS
gcloud run deploy gaig-pdf-website \
    --image us-central1-docker.pkg.dev/$PROJECT_ID/gaig-docker-repo/gaig-pdf-website:latest \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --ingress all \
    --set-env-vars "ES_URL=https://insurance-f41a6d.es.eastus.azure.elastic.cloud" \
    --set-env-vars "API_KEY=Q0o5WDZKa0I3VkdwRUNqTEd4YlY6YmxNNUNUMnZfdy16Y3htcEZjYVVXQQ==" \
    --set-env-vars "INDEX_NAME=great-american-insurance-pdfs" \
    --port 3000 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --timeout 300

# Ensure public access is enabled
gcloud run services add-iam-policy-binding gaig-pdf-website \
    --region=us-central1 \
    --member="allUsers" \
    --role="roles/run.invoker"
```

**Note:**
- `--allow-unauthenticated` allows anyone on the internet to access the service
- `--ingress all` allows traffic from the internet (not just internal GCP services)
- The IAM policy binding ensures the "allUsers" group can invoke the service

**For production, use Secret Manager instead of inline env vars:**
```bash
# Create secrets
echo -n "https://insurance-f41a6d.es.eastus.azure.elastic.cloud" | gcloud secrets create es-url --data-file=-
echo -n "Q0o5WDZKa0I3VkdwRUNqTEd4YlY6YmxNNUNUMnZfdy16Y3htcEZjYVVXQQ==" | gcloud secrets create api-key --data-file=-
echo -n "great-american-insurance-pdfs" | gcloud secrets create index-name --data-file=-

# Deploy with secrets - ALLOWS PUBLIC INTERNET ACCESS
gcloud run deploy gaig-pdf-website \
    --image us-central1-docker.pkg.dev/$PROJECT_ID/gaig-docker-repo/gaig-pdf-website:latest \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --ingress all \
    --set-secrets "ES_URL=es-url:latest,API_KEY=api-key:latest,INDEX_NAME=index-name:latest" \
    --port 3000 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --timeout 300

# Ensure public access
gcloud run services add-iam-policy-binding gaig-pdf-website \
    --region=us-central1 \
    --member="allUsers" \
    --role="roles/run.invoker"
```

## One-Command Deployment

After initial setup, you can deploy updates with a single command:

```bash
# Build and deploy in one step - ALLOWS PUBLIC INTERNET ACCESS
gcloud run deploy gaig-pdf-website \
    --source . \
    --region us-central1 \
    --allow-unauthenticated \
    --ingress all \
    --set-env-vars "ES_URL=https://insurance-f41a6d.es.eastus.azure.elastic.cloud,API_KEY=Q0o5WDZKa0I3VkdwRUNqTEd4YlY6YmxNNUNUMnZfdy16Y3htcEZjYVVXQQ==,INDEX_NAME=great-american-insurance-pdfs" \
    --port 3000 \
    --memory 512Mi \
    --cpu 1

# Ensure public access
gcloud run services add-iam-policy-binding gaig-pdf-website \
    --region=us-central1 \
    --member="allUsers" \
    --role="roles/run.invoker"
```

## Post-Deployment

### Verify Public Access

```bash
# Check IAM policy to confirm public access
gcloud run services get-iam-policy gaig-pdf-website --region us-central1

# You should see output containing:
# - members:
#   - allUsers
#   role: roles/run.invoker
```

### Get Service URL
```bash
# Get the public URL
SERVICE_URL=$(gcloud run services describe gaig-pdf-website \
    --region us-central1 \
    --format 'value(status.url)')

echo "Your public website URL: $SERVICE_URL"

# Test the URL
curl $SERVICE_URL
```

### View Logs
```bash
gcloud run logs read gaig-pdf-website \
    --region us-central1 \
    --limit 50
```

### Update Service
```bash
# Update just the environment variables
gcloud run services update gaig-pdf-website \
    --region us-central1 \
    --set-env-vars "INDEX_NAME=new-index-name"
```

## Set Up Custom Domain (Optional)

```bash
# Map custom domain
gcloud run domain-mappings create \
    --service gaig-pdf-website \
    --domain search.greatamericaninsurance.com \
    --region us-central1
```

## CI/CD with GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches:
      - main

env:
  PROJECT_ID: YOUR_PROJECT_ID
  SERVICE_NAME: gaig-pdf-website
  REGION: us-central1

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - id: 'auth'
      uses: 'google-github-actions/auth@v1'
      with:
        credentials_json: '${{ secrets.GCP_SA_KEY }}'

    - name: 'Set up Cloud SDK'
      uses: 'google-github-actions/setup-gcloud@v1'

    - name: 'Deploy to Cloud Run'
      run: |
        gcloud run deploy ${{ env.SERVICE_NAME }} \
          --source . \
          --region ${{ env.REGION }} \
          --allow-unauthenticated \
          --ingress all \
          --set-secrets "ES_URL=es-url:latest,API_KEY=api-key:latest,INDEX_NAME=index-name:latest"

        # Ensure public access
        gcloud run services add-iam-policy-binding ${{ env.SERVICE_NAME }} \
          --region=${{ env.REGION }} \
          --member="allUsers" \
          --role="roles/run.invoker"
```

## Troubleshooting

### Check service status
```bash
gcloud run services describe gaig-pdf-website --region us-central1
```

### View detailed logs
```bash
gcloud run logs tail gaig-pdf-website --region us-central1
```

### Test locally with Docker
```bash
# Build image
docker build -t gaig-pdf-website .

# Run locally
docker run -p 3000:3000 \
  -e ES_URL="https://insurance-f41a6d.es.eastus.azure.elastic.cloud" \
  -e API_KEY="Q0o5WDZKa0I3VkdwRUNqTEd4YlY6YmxNNUNUMnZfdy16Y3htcEZjYVVXQQ==" \
  -e INDEX_NAME="great-american-insurance-pdfs" \
  gaig-pdf-website
```

## Cost Optimization

```bash
# Set minimum instances to 0 to avoid charges when idle
gcloud run services update gaig-pdf-website \
    --region us-central1 \
    --min-instances 0

# Set maximum instances to control costs
gcloud run services update gaig-pdf-website \
    --region us-central1 \
    --max-instances 5
```

## Clean Up

```bash
# Delete the Cloud Run service
gcloud run services delete gaig-pdf-website --region us-central1

# Delete the container image
gcloud artifacts docker images delete \
    us-central1-docker.pkg.dev/$PROJECT_ID/gaig-docker-repo/gaig-pdf-website:latest
```
