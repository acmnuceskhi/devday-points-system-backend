#!/usr/bin/env bash
# ONE-TIME setup: creates all AWS infrastructure for devday-points-backend.
# Prerequisites: AWS CLI installed + configured (run `aws configure` first),
#                Docker running locally.
#
# Fill in ALL values below, then run from the repo root:
#   bash scripts/aws-setup.sh
set -euo pipefail

# ── Configuration — fill these in ────────────────────────────────────────────
AWS_REGION="us-east-1"            # e.g. ap-southeast-1, eu-west-1
APP_NAME="devday-points-backend"

DATABASE_URL=""                   # Supabase connection string (with ?pgbouncer=true)
JWT_SECRET=""                     # Strong secret, min 12 chars
JWT_EXPIRES_IN="8h"
FRONTEND_ORIGIN=""                # e.g. https://devday.yourdomain.com
NODE_ENV="production"
PORT="3000"
SIGNUP_VERIFY_BASE_URL=""         # Base URL for email verification links
SYSTEM_STAFF_PROFILE_ID=""        # UUID of the system staff profile
ALLOW_EMPTY_PASSWORD_LOGIN="false"

SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER=""                      # Gmail address
SMTP_PASS=""                      # Gmail app password (not your login password)
SMTP_FROM_EMAIL=""                # e.g. noreply@devday.com
SMTP_FROM_NAME="DevDay 2026"
# ─────────────────────────────────────────────────────────────────────────────

for var in DATABASE_URL JWT_SECRET FRONTEND_ORIGIN SMTP_USER SMTP_PASS SMTP_FROM_EMAIL; do
  [ -z "${!var}" ] && echo "Error: $var is not set. Fill in all values at the top of this script." && exit 1
done

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$APP_NAME"
EXEC_ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/${APP_NAME}-exec-role"
INFRA_ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/${APP_NAME}-infra-role"

echo ">>> [1/5] ECR: creating repo and pushing initial image..."
aws ecr create-repository --repository-name "$APP_NAME" --region "$AWS_REGION" 2>/dev/null || true
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
docker build -t "$ECR_URI:latest" .
docker push "$ECR_URI:latest"

echo ">>> [2/5] IAM: creating task execution role..."
aws iam create-role \
  --role-name "${APP_NAME}-exec-role" \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  2>/dev/null || true
aws iam attach-role-policy \
  --role-name "${APP_NAME}-exec-role" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy" 2>/dev/null || true

echo ">>> [3/5] IAM: creating infrastructure role (ECS uses this to auto-create ALB, security groups, auto-scaling)..."
aws iam create-role \
  --role-name "${APP_NAME}-infra-role" \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  2>/dev/null || true
aws iam put-role-policy \
  --role-name "${APP_NAME}-infra-role" \
  --policy-name "${APP_NAME}-infra-policy" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {"Effect":"Allow","Action":["elasticloadbalancing:*"],"Resource":"*"},
      {"Effect":"Allow","Action":["ec2:CreateSecurityGroup","ec2:DeleteSecurityGroup","ec2:AuthorizeSecurityGroupIngress","ec2:RevokeSecurityGroupIngress","ec2:DescribeSecurityGroups","ec2:DescribeVpcs","ec2:DescribeSubnets","ec2:DescribeAvailabilityZones","ec2:DescribeInternetGateways","ec2:CreateTags","ec2:DeleteTags"],"Resource":"*"},
      {"Effect":"Allow","Action":["application-autoscaling:*"],"Resource":"*"},
      {"Effect":"Allow","Action":["cloudwatch:PutMetricAlarm","cloudwatch:DeleteAlarms","cloudwatch:DescribeAlarms"],"Resource":"*"}
    ]
  }' 2>/dev/null || true

echo ">>> [4/5] ECS Express Mode: creating service..."
# Express Mode auto-creates the ALB (with HTTPS), target group, security groups,
# and auto-scaling. No manual VPC/SG/ALB setup required.
SVC_FILE=$(mktemp /tmp/express-svc-XXXXXX.json)
cat > "$SVC_FILE" << SVCJSON
{
  "serviceName": "$APP_NAME",
  "executionRoleArn": "$EXEC_ROLE_ARN",
  "infrastructureRoleArn": "$INFRA_ROLE_ARN",
  "primaryContainer": {
    "name": "$APP_NAME",
    "image": "$ECR_URI:latest",
    "portMappings": [{"containerPort": 3000}],
    "environment": [
      {"name": "NODE_ENV",                   "value": "$NODE_ENV"},
      {"name": "PORT",                       "value": "$PORT"},
      {"name": "DATABASE_URL",               "value": "$DATABASE_URL"},
      {"name": "JWT_SECRET",                 "value": "$JWT_SECRET"},
      {"name": "JWT_EXPIRES_IN",             "value": "$JWT_EXPIRES_IN"},
      {"name": "FRONTEND_ORIGIN",            "value": "$FRONTEND_ORIGIN"},
      {"name": "SIGNUP_VERIFY_BASE_URL",     "value": "$SIGNUP_VERIFY_BASE_URL"},
      {"name": "SYSTEM_STAFF_PROFILE_ID",    "value": "$SYSTEM_STAFF_PROFILE_ID"},
      {"name": "ALLOW_EMPTY_PASSWORD_LOGIN", "value": "$ALLOW_EMPTY_PASSWORD_LOGIN"},
      {"name": "SMTP_HOST",                  "value": "$SMTP_HOST"},
      {"name": "SMTP_PORT",                  "value": "$SMTP_PORT"},
      {"name": "SMTP_SECURE",                "value": "$SMTP_SECURE"},
      {"name": "SMTP_USER",                  "value": "$SMTP_USER"},
      {"name": "SMTP_PASS",                  "value": "$SMTP_PASS"},
      {"name": "SMTP_FROM_EMAIL",            "value": "$SMTP_FROM_EMAIL"},
      {"name": "SMTP_FROM_NAME",             "value": "$SMTP_FROM_NAME"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/$APP_NAME",
        "awslogs-region": "$AWS_REGION",
        "awslogs-stream-prefix": "ecs",
        "awslogs-create-group": "true"
      }
    }
  },
  "cpu": "256",
  "memory": "512",
  "healthCheckPath": "/health"
}
SVCJSON
SVC_OUTPUT=$(aws ecs create-express-gateway-service \
  --cli-input-json "file://$SVC_FILE" \
  --region "$AWS_REGION")
rm -f "$SVC_FILE"
SERVICE_URL=$(echo "$SVC_OUTPUT" | grep '"serviceUrl"' | awk -F'"' '{print $4}')

echo ">>> [5/5] IAM: creating GitHub Actions deploy user..."
aws iam create-user --user-name "${APP_NAME}-ci" 2>/dev/null || true
aws iam put-user-policy \
  --user-name "${APP_NAME}-ci" \
  --policy-name "${APP_NAME}-ci-policy" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {"Effect":"Allow","Action":["ecr:GetAuthorizationToken","ecr:BatchCheckLayerAvailability","ecr:GetDownloadUrlForLayer","ecr:BatchGetImage","ecr:PutImage","ecr:InitiateLayerUpload","ecr:UploadLayerPart","ecr:CompleteLayerUpload"],"Resource":"*"},
      {"Effect":"Allow","Action":["ecs:UpdateExpressGatewayService","ecs:DescribeExpressGatewayServices"],"Resource":"*"}
    ]
  }' 2>/dev/null || true
KEY_OUTPUT=$(aws iam create-access-key --user-name "${APP_NAME}-ci")
GH_KEY_ID=$(echo "$KEY_OUTPUT" | grep '"AccessKeyId"' | awk -F'"' '{print $4}')
GH_KEY_SECRET=$(echo "$KEY_OUTPUT" | grep '"SecretAccessKey"' | awk -F'"' '{print $4}')

echo ""
echo "════════════════════════════════════════════════════════════════"
echo " SETUP COMPLETE"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo " Your API URL (HTTPS, takes ~3 min to become healthy):"
echo "   $SERVICE_URL"
echo ""
echo " Add these 3 secrets to GitHub → Settings → Secrets → Actions:"
echo ""
echo "   AWS_REGION=$AWS_REGION"
echo "   AWS_ACCESS_KEY_ID=$GH_KEY_ID"
echo "   AWS_SECRET_ACCESS_KEY=$GH_KEY_SECRET"
echo ""
echo " After adding the secrets, push to master to trigger CI/CD."
echo "════════════════════════════════════════════════════════════════"
