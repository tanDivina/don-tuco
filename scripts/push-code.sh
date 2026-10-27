#!/usr/bin/env bash
# Upload the current code to the don-tuco-agent Lambda without touching the stack,
# and (optionally) set OWNER_WHATSAPP while keeping every other env var.
# Usage: scripts/push-code.sh [+owner_e164]
set -euo pipefail
cd "$(dirname "$0")/.."
REGION="${AWS_REGION:-us-east-1}"
FN=don-tuco-agent
B="$(mktemp -d)"; trap 'rm -rf "$B"' EXIT
cp -R src packs package.json node_modules "$B/"
(cd "$B" && zip -qr code.zip . -x code.zip)
aws lambda update-function-code --region "$REGION" --function-name "$FN" \
  --zip-file "fileb://$B/code.zip" --no-cli-pager --query LastModified --output text
aws lambda wait function-updated --region "$REGION" --function-name "$FN"
if [ -n "${1:-}" ]; then
  aws lambda get-function-configuration --region "$REGION" --function-name "$FN" \
    --query Environment.Variables --output json |
    python3 -c "import json,sys; v=json.load(sys.stdin); v['OWNER_WHATSAPP']=sys.argv[1]; print(json.dumps({'Variables':v}))" "$1" > "$B/env.json"
  aws lambda update-function-configuration --region "$REGION" --function-name "$FN" \
    --environment "file://$B/env.json" --no-cli-pager --query LastUpdateStatus --output text
  aws lambda wait function-updated --region "$REGION" --function-name "$FN"
fi
echo "deployed"
