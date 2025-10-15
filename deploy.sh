#!/bin/bash

# Quick deployment script for Google Cloud Run
# Usage: ./deploy.sh

set -e

# Configuration
PROJECT_ID="primal-carport-153214"  # Replace with your GCP project ID
SERVICE_NAME="gaig-pdf-website"
REGION="us-central1"
IMAGE_NAME="us-central1-docker.pkg.dev/${PROJECT_ID}/gaig-docker-repo/${SERVICE_NAME}:latest"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}GAIC PDF Website - Cloud Run Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if PROJECT_ID is set
if [ "$PROJECT_ID" == "YOUR_PROJECT_ID" ]; then
    echo -e "${RED}Error: Please set your PROJECT_ID in this script${NC}"
    exit 1
fi

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set project
echo -e "${YELLOW}Setting GCP project...${NC}"
gcloud config set project $PROJECT_ID

# Build and deploy using Cloud Build (simplest method)
echo -e "${YELLOW}Building and deploying to Cloud Run...${NC}"
echo -e "${YELLOW}Note: This deployment allows PUBLIC internet access (--allow-unauthenticated)${NC}"
gcloud run deploy $SERVICE_NAME \
    --source . \
    --region $REGION \
    --allow-unauthenticated \
    --ingress all \
    --set-env-vars "ES_URL=${ES_URL:-https://insurance-f41a6d.es.eastus.azure.elastic.cloud}" \
    --set-env-vars "API_KEY=${API_KEY:-Q0o5WDZKa0I3VkdwRUNqTEd4YlY6YmxNNUNUMnZfdy16Y3htcEZjYVVXQQ==}" \
    --set-env-vars "INDEX_NAME=${INDEX_NAME:-great-american-insurance-pdfs}" \
    --port 3000 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --timeout 300

# Set IAM policy to allow public access
echo -e "${YELLOW}Setting IAM policy to allow all users...${NC}"
gcloud run services add-iam-policy-binding $SERVICE_NAME \
    --region=$REGION \
    --member="allUsers" \
    --role="roles/run.invoker"

# Get service URL
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')
echo -e "${GREEN}Service URL: ${SERVICE_URL}${NC}"
echo ""
echo -e "${YELLOW}View logs:${NC}"
echo "gcloud run logs tail $SERVICE_NAME --region $REGION"
