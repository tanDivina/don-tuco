#!/usr/bin/env bash
# Deploy Don Tuco: CloudFormation stack + Lambda code upload.
# Usage: scripts/deploy.sh [stack-name]
set -euo pipefail
cd "$(dirname "$0")/.."

STACK="${1:-don-tuco}"
REGION="${AWS_REGION:-us-east-1}"
PHONE_ID="${WHATSAPP_PHONE_NUMBER_ID:-}"
MODEL="${MODEL_ID:-us.anthropic.claude-sonnet-4-5-20250929-v1:0}"

echo "==> Deploying stack '$STACK' in $REGION"
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK" \
  --template-file infra/template.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    WhatsAppPhoneNumberId="$PHONE_ID" \
    ModelId="$MODEL"

echo "==> Packaging Lambda code"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT
cp -R src packs package.json "$BUILD/"
cp -R node_modules "$BUILD/node_modules"
(cd "$BUILD" && zip -qr code.zip . -x 'code.zip')

FN="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='FunctionName'].OutputValue" --output text)"
aws lambda update-function-code --region "$REGION" \
  --function-name "$FN" --zip-file "fileb://$BUILD/code.zip" --no-cli-pager >/dev/null
aws lambda wait function-updated --region "$REGION" --function-name "$FN"

echo "==> Done"
aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs" --output table
