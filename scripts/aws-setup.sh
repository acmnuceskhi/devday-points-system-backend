#!/usr/bin/env bash
# ONE-TIME setup: creates all AWS infrastructure for devday-points-backend.
# Prerequisites: AWS CLI installed + configured (run `aws configure` first).
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

# Validate required vars
for var in DATABASE_URL JWT_SECRET FRONTEND_ORIGIN SMTP_USER SMTP_PASS SMTP_FROM_EMAIL; do
  if [ -z "${!var}" ]; then
    echo "Error: $var is not set. Fill in all values at the top of this script."
    exit 1
  fi
done

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$APP_NAME"

echo ">>> [1/11] Creating ECR repository..."
aws ecr create-repository \
  --repository-name "$APP_NAME" \
  --region "$AWS_REGION" 2>/dev/null || echo "  (already exists)"

echo ">>> [2/11] Building and pushing Docker image..."
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
docker build -t "$ECR_URI:latest" .
docker push "$ECR_URI:latest"

echo ">>> [3/11] Creating IAM task execution role..."
aws iam create-role \
  --role-name "${APP_NAME}-exec-role" \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  2>/dev/null || echo "  (already exists)"
aws iam attach-role-policy \
  --role-name "${APP_NAME}-exec-role" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy" \
  2>/dev/null || true

echo ">>> [4/11] Creating ECS cluster..."
aws ecs create-cluster \
  --cluster-name "$APP_NAME" \
  --region "$AWS_REGION" > /dev/null 2>&1 || echo "  (already exists)"

echo ">>> [5/11] Creating CloudWatch log group..."
aws logs create-log-group \
  --log-group-name "/ecs/$APP_NAME" \
  --region "$AWS_REGION" 2>/dev/null || echo "  (already exists)"

echo ">>> [6/11] Registering task definition..."
TASK_DEF_FILE=$(mktemp /tmp/task-def-XXXXXX.json)
cat > "$TASK_DEF_FILE" << TASKDEF
{
  "family": "$APP_NAME",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/${APP_NAME}-exec-role",
  "containerDefinitions": [
    {
      "name": "$APP_NAME",
      "image": "$ECR_URI:latest",
      "essential": true,
      "portMappings": [{"containerPort": 3000, "protocol": "tcp"}],
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
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode===200?0:1))\""],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 30
      }
    }
  ]
}
TASKDEF
aws ecs register-task-definition \
  --cli-input-json "file://$TASK_DEF_FILE" \
  --region "$AWS_REGION" > /dev/null
rm -f "$TASK_DEF_FILE"

echo ">>> [7/11] Getting default VPC and subnets..."
VPC_ID=$(aws ec2 describe-vpcs \
  --region "$AWS_REGION" \
  --filters "Name=isDefault,Values=true" \
  --query "Vpcs[0].VpcId" --output text)
SUBNET_IDS=$(aws ec2 describe-subnets \
  --region "$AWS_REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[*].SubnetId" --output text)
read -ra SUBNET_ARR <<< "$(echo "$SUBNET_IDS" | tr '\t\n' ' ')"
SUBNET_CSV=$(echo "$SUBNET_IDS" | tr '\t\n' ',' | sed 's/,$//')

echo ">>> [8/11] Creating security groups..."
# ALB SG: accepts HTTP from internet
ALB_SG_ID=$(aws ec2 describe-security-groups \
  --region "$AWS_REGION" \
  --filters "Name=group-name,Values=${APP_NAME}-alb-sg" "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || echo "None")
if [ "$ALB_SG_ID" = "None" ] || [ -z "$ALB_SG_ID" ]; then
  ALB_SG_ID=$(aws ec2 create-security-group \
    --group-name "${APP_NAME}-alb-sg" \
    --description "ALB for $APP_NAME" \
    --vpc-id "$VPC_ID" --region "$AWS_REGION" \
    --query GroupId --output text)
  aws ec2 authorize-security-group-ingress \
    --group-id "$ALB_SG_ID" --protocol tcp --port 80 --cidr 0.0.0.0/0 \
    --region "$AWS_REGION" > /dev/null
fi

# App SG: accepts port 3000 from ALB SG only
APP_SG_ID=$(aws ec2 describe-security-groups \
  --region "$AWS_REGION" \
  --filters "Name=group-name,Values=${APP_NAME}-sg" "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || echo "None")
if [ "$APP_SG_ID" = "None" ] || [ -z "$APP_SG_ID" ]; then
  APP_SG_ID=$(aws ec2 create-security-group \
    --group-name "${APP_NAME}-sg" \
    --description "ECS tasks for $APP_NAME" \
    --vpc-id "$VPC_ID" --region "$AWS_REGION" \
    --query GroupId --output text)
  aws ec2 authorize-security-group-ingress \
    --group-id "$APP_SG_ID" \
    --ip-permissions "[{\"IpProtocol\":\"tcp\",\"FromPort\":3000,\"ToPort\":3000,\"UserIdGroupPairs\":[{\"GroupId\":\"$ALB_SG_ID\"}]}]" \
    --region "$AWS_REGION" > /dev/null
fi

echo ">>> [9/11] Creating Application Load Balancer..."
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name "${APP_NAME}-alb" \
  --subnets "${SUBNET_ARR[@]}" \
  --security-groups "$ALB_SG_ID" \
  --scheme internet-facing \
  --type application \
  --region "$AWS_REGION" \
  --query "LoadBalancers[0].LoadBalancerArn" --output text)
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" \
  --region "$AWS_REGION" \
  --query "LoadBalancers[0].DNSName" --output text)
TG_ARN=$(aws elbv2 create-target-group \
  --name "${APP_NAME}-tg" \
  --protocol HTTP --port 3000 \
  --vpc-id "$VPC_ID" --target-type ip \
  --health-check-path "/health" \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --region "$AWS_REGION" \
  --query "TargetGroups[0].TargetGroupArn" --output text)
aws elbv2 create-listener \
  --load-balancer-arn "$ALB_ARN" \
  --protocol HTTP --port 80 \
  --default-actions "Type=forward,TargetGroupArn=$TG_ARN" \
  --region "$AWS_REGION" > /dev/null

echo ">>> [10/11] Creating ECS service..."
aws ecs create-service \
  --cluster "$APP_NAME" \
  --service-name "$APP_NAME" \
  --task-definition "$APP_NAME" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_CSV],securityGroups=[$APP_SG_ID],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=$APP_NAME,containerPort=3000" \
  --region "$AWS_REGION" > /dev/null

echo ">>> [11/11] Creating GitHub Actions IAM user..."
aws iam create-user --user-name "${APP_NAME}-ci" 2>/dev/null || echo "  (already exists)"
aws iam create-policy \
  --policy-name "${APP_NAME}-ci-policy" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload"
        ],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": [
          "ecs:RegisterTaskDefinition",
          "ecs:DescribeTaskDefinition",
          "ecs:UpdateService",
          "ecs:DescribeServices"
        ],
        "Resource": "*"
      }
    ]
  }' 2>/dev/null || echo "  (policy already exists)"
aws iam attach-user-policy \
  --user-name "${APP_NAME}-ci" \
  --policy-arn "arn:aws:iam::$ACCOUNT_ID:policy/${APP_NAME}-ci-policy" \
  2>/dev/null || true
KEY_OUTPUT=$(aws iam create-access-key --user-name "${APP_NAME}-ci")
GH_KEY_ID=$(echo "$KEY_OUTPUT" | grep '"AccessKeyId"' | awk -F'"' '{print $4}')
GH_KEY_SECRET=$(echo "$KEY_OUTPUT" | grep '"SecretAccessKey"' | awk -F'"' '{print $4}')

echo ""
echo "════════════════════════════════════════════════════════════════"
echo " SETUP COMPLETE"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo " Your API URL (takes ~3 min to become healthy):"
echo "   http://$ALB_DNS"
echo ""
echo " Add these 6 secrets to GitHub → Settings → Secrets → Actions:"
echo ""
echo "   AWS_REGION=$AWS_REGION"
echo "   ECR_REPOSITORY=$APP_NAME"
echo "   ECS_CLUSTER=$APP_NAME"
echo "   ECS_SERVICE=$APP_NAME"
echo "   AWS_ACCESS_KEY_ID=$GH_KEY_ID"
echo "   AWS_SECRET_ACCESS_KEY=$GH_KEY_SECRET"
echo ""
echo " After adding the secrets, push to master to trigger CI/CD."
echo "════════════════════════════════════════════════════════════════"
