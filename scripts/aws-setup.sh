#!/usr/bin/env bash
# ONE-TIME setup: creates AWS infrastructure for devday-points-backend.
# Prerequisites: AWS CLI installed + configured, Docker running.
#
# Usage (run once per environment):
#   bash scripts/aws-setup.sh dev    # dev environment  (from 'dev' branch)
#   bash scripts/aws-setup.sh main   # staging/main env (from 'main' branch)
#   bash scripts/aws-setup.sh prod   # production env   (from 'prod' branch)
set -euo pipefail

ENV="${1:-}"
if [[ "$ENV" != "dev" && "$ENV" != "main" && "$ENV" != "prod" ]]; then
  echo "Usage: bash scripts/aws-setup.sh <dev|main|prod>"
  exit 1
fi

# ── AWS config ────────────────────────────────────────────────────────────────
AWS_REGION="us-east-1"            # change to your preferred region
ECR_REPO="devday-points-backend"  # shared ECR repo for all envs

SERVICE_NAME="devday-points-backend-$ENV"
CLUSTER_NAME="devday-$ENV"

# ── Environment variables — fill in values for ALL THREE sections ──────────────
if [ "$ENV" = "prod" ]; then
  DATABASE_URL=""                 # Supabase prod connection string (?pgbouncer=true)
  JWT_SECRET=""                   # strong secret, min 12 chars
  JWT_EXPIRES_IN="8h"
  FRONTEND_ORIGIN=""              # e.g. https://devday.yourdomain.com
  SIGNUP_VERIFY_BASE_URL=""
  SYSTEM_STAFF_PROFILE_ID=""
  ALLOW_EMPTY_PASSWORD_LOGIN="false"
  SMTP_USER=""                    # Gmail address
  SMTP_PASS=""                    # Gmail app password
  SMTP_FROM_EMAIL=""
  SMTP_FROM_NAME="DevDay 2026"

elif [ "$ENV" = "main" ]; then
  DATABASE_URL=""                 # Supabase staging connection string
  JWT_SECRET=""
  JWT_EXPIRES_IN="8h"
  FRONTEND_ORIGIN=""              # e.g. https://staging.devday.yourdomain.com
  SIGNUP_VERIFY_BASE_URL=""
  SYSTEM_STAFF_PROFILE_ID=""
  ALLOW_EMPTY_PASSWORD_LOGIN="false"
  SMTP_USER=""
  SMTP_PASS=""
  SMTP_FROM_EMAIL=""
  SMTP_FROM_NAME="DevDay 2026 (staging)"

else  # dev
  DATABASE_URL=""                 # Supabase dev connection string
  JWT_SECRET="dev-secret-change-me-12chars"
  JWT_EXPIRES_IN="24h"
  FRONTEND_ORIGIN="http://localhost:5173"
  SIGNUP_VERIFY_BASE_URL=""
  SYSTEM_STAFF_PROFILE_ID=""
  ALLOW_EMPTY_PASSWORD_LOGIN="true"
  SMTP_USER=""
  SMTP_PASS=""
  SMTP_FROM_EMAIL=""
  SMTP_FROM_NAME="DevDay 2026 (dev)"
fi
# ─────────────────────────────────────────────────────────────────────────────

for var in DATABASE_URL SMTP_USER SMTP_PASS SMTP_FROM_EMAIL; do
  [ -z "${!var}" ] && echo "Error: $var is not set in the '$ENV' section." && exit 1
done

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO"
EXEC_ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/ecsTaskExecutionRole"
INFRA_ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/ecsInfrastructureRoleForExpressServices"

echo ""
echo "Deploying: $SERVICE_NAME  |  cluster: $CLUSTER_NAME  |  region: $AWS_REGION"
echo ""

# ── [1/5] ECR ─────────────────────────────────────────────────────────────────
echo ">>> [1/5] ECR: creating repo and pushing image..."
aws ecr create-repository --repository-name "$ECR_REPO" --region "$AWS_REGION" \
  2>/dev/null || echo "  (repo already exists)"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
docker build -t "$ECR_URI:latest" .
docker push "$ECR_URI:latest"

# ── [2/5] IAM roles (shared across envs, idempotent) ─────────────────────────
echo ">>> [2/5] IAM: creating shared roles..."

aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  2>/dev/null || echo "  (ecsTaskExecutionRole already exists)"
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy \
  2>/dev/null || true

aws iam create-role \
  --role-name ecsInfrastructureRoleForExpressServices \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Sid":"AllowAccessInfrastructureForECSExpressServices","Effect":"Allow","Principal":{"Service":"ecs.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  2>/dev/null || echo "  (ecsInfrastructureRoleForExpressServices already exists)"
aws iam attach-role-policy \
  --role-name ecsInfrastructureRoleForExpressServices \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices \
  2>/dev/null || true

# ── [3/5] Build primary container JSON ────────────────────────────────────────
echo ">>> [3/5] Building container configuration..."
PRIMARY_CONTAINER=$(printf '%s' \
  '{"image":"'"$ECR_URI"':latest","containerPort":3000,' \
  '"environment":[' \
  '{"name":"NODE_ENV","value":"production"},' \
  '{"name":"PORT","value":"3000"},' \
  '{"name":"DATABASE_URL","value":"'"$DATABASE_URL"'"},' \
  '{"name":"JWT_SECRET","value":"'"$JWT_SECRET"'"},' \
  '{"name":"JWT_EXPIRES_IN","value":"'"$JWT_EXPIRES_IN"'"},' \
  '{"name":"FRONTEND_ORIGIN","value":"'"$FRONTEND_ORIGIN"'"},' \
  '{"name":"SIGNUP_VERIFY_BASE_URL","value":"'"$SIGNUP_VERIFY_BASE_URL"'"},' \
  '{"name":"SYSTEM_STAFF_PROFILE_ID","value":"'"$SYSTEM_STAFF_PROFILE_ID"'"},' \
  '{"name":"ALLOW_EMPTY_PASSWORD_LOGIN","value":"'"$ALLOW_EMPTY_PASSWORD_LOGIN"'"},' \
  '{"name":"SMTP_HOST","value":"smtp.gmail.com"},' \
  '{"name":"SMTP_PORT","value":"587"},' \
  '{"name":"SMTP_SECURE","value":"false"},' \
  '{"name":"SMTP_USER","value":"'"$SMTP_USER"'"},' \
  '{"name":"SMTP_PASS","value":"'"$SMTP_PASS"'"},' \
  '{"name":"SMTP_FROM_EMAIL","value":"'"$SMTP_FROM_EMAIL"'"},' \
  '{"name":"SMTP_FROM_NAME","value":"'"$SMTP_FROM_NAME"'"}' \
  ']}')

# ── [4/5] Create ECS Express Mode service ─────────────────────────────────────
echo ">>> [4/5] ECS Express Mode: creating $SERVICE_NAME..."
echo "    (auto-creates: ALB + HTTPS, security groups, auto-scaling, ACM cert)"
echo "    Monitoring deployment — takes ~3 min..."
SVC_OUTPUT=$(aws ecs create-express-gateway-service \
  --service-name "$SERVICE_NAME" \
  --cluster "$CLUSTER_NAME" \
  --execution-role-arn "$EXEC_ROLE_ARN" \
  --infrastructure-role-arn "$INFRA_ROLE_ARN" \
  --primary-container "$PRIMARY_CONTAINER" \
  --cpu 1 \
  --memory 2 \
  --health-check-path "/health" \
  --monitor-resources \
  --region "$AWS_REGION")
SERVICE_URL=$(echo "$SVC_OUTPUT" | grep -o '"endpoint":"[^"]*"' | head -1 | cut -d'"' -f4)

# ── [5/5] GitHub Actions IAM user (shared, created once) ─────────────────────
echo ">>> [5/5] IAM: creating GitHub Actions deploy user..."
aws iam create-user --user-name devday-github-ci 2>/dev/null || echo "  (already exists)"
aws iam put-user-policy \
  --user-name devday-github-ci \
  --policy-name devday-github-ci-policy \
  --policy-document '{
    "Version":"2012-10-17",
    "Statement":[
      {"Effect":"Allow","Action":["ecr:GetAuthorizationToken","ecr:BatchCheckLayerAvailability","ecr:GetDownloadUrlForLayer","ecr:BatchGetImage","ecr:PutImage","ecr:InitiateLayerUpload","ecr:UploadLayerPart","ecr:CompleteLayerUpload"],"Resource":"*"},
      {"Effect":"Allow","Action":["ecs:UpdateExpressGatewayService","ecs:DescribeExpressGatewayServices","ecs:MonitorExpressGatewayService"],"Resource":"*"}
    ]
  }' 2>/dev/null || echo "  (policy already exists)"

KEY_COUNT=$(aws iam list-access-keys --user-name devday-github-ci \
  --query "length(AccessKeyMetadata)" --output text 2>/dev/null || echo "0")
if [ "$KEY_COUNT" -gt "0" ]; then
  GH_KEY_ID="(reuse keys from first run)"
  GH_KEY_SECRET="(reuse keys from first run)"
else
  KEY_OUTPUT=$(aws iam create-access-key --user-name devday-github-ci)
  GH_KEY_ID=$(echo "$KEY_OUTPUT" | grep '"AccessKeyId"' | awk -F'"' '{print $4}')
  GH_KEY_SECRET=$(echo "$KEY_OUTPUT" | grep '"SecretAccessKey"' | awk -F'"' '{print $4}')
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo " $ENV environment ready"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo " API URL (HTTPS, format: https://$SERVICE_NAME.ecs.$AWS_REGION.on.aws)"
[ -n "${SERVICE_URL:-}" ] && echo "   $SERVICE_URL"
echo ""
if [[ "$GH_KEY_ID" != "(reuse"* ]]; then
  echo " Add these 3 secrets to GitHub → Settings → Secrets → Actions:"
  echo "   AWS_REGION=$AWS_REGION"
  echo "   AWS_ACCESS_KEY_ID=$GH_KEY_ID"
  echo "   AWS_SECRET_ACCESS_KEY=$GH_KEY_SECRET"
  echo ""
fi
echo " Branch → environment mapping:"
echo "   dev    → devday-points-backend-dev   (cluster: devday-dev)"
echo "   main   → devday-points-backend-main  (cluster: devday-main)"
echo "   prod   → devday-points-backend-prod  (cluster: devday-prod)"
echo ""
echo " Run this script again for the other environments."
echo "════════════════════════════════════════════════════════════════"
