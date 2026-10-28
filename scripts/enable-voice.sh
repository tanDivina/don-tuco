#!/usr/bin/env bash
# Turn on voice-note transcription for an already deployed stack without a stack update:
# a private media bucket (objects expire after a day), the extra role permissions,
# then the code and MEDIA_BUCKET. A fresh `scripts/deploy.sh` creates all of this itself.
set -euo pipefail
cd "$(dirname "$0")/.."
REGION="${AWS_REGION:-us-east-1}"
FN=don-tuco-agent
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="don-tuco-media-$ACCOUNT"
ROLE="$(aws lambda get-function-configuration --region "$REGION" --function-name "$FN" --query Role --output text)"
ROLE="${ROLE##*/}"

aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null || aws s3api create-bucket --region "$REGION" --bucket "$BUCKET" >/dev/null
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration \
  '{"Rules":[{"ID":"expire-voice-notes","Status":"Enabled","Filter":{},"Expiration":{"Days":1}}]}'

aws iam put-role-policy --role-name "$ROLE" --policy-name don-tuco-voice --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {\"Effect\": \"Allow\", \"Action\": \"social-messaging:GetWhatsAppMessageMedia\", \"Resource\": \"*\"},
    {\"Effect\": \"Allow\", \"Action\": [\"s3:PutObject\", \"s3:GetObject\"], \"Resource\": \"arn:aws:s3:::$BUCKET/*\"},
    {\"Effect\": \"Allow\", \"Action\": [\"transcribe:StartTranscriptionJob\", \"transcribe:GetTranscriptionJob\", \"transcribe:DeleteTranscriptionJob\"], \"Resource\": \"*\"}
  ]
}"
echo "bucket $BUCKET and role $ROLE ready"
scripts/push-code.sh --set "MEDIA_BUCKET=$BUCKET"
