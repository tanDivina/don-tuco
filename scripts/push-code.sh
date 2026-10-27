#!/usr/bin/env bash
# Upload the current code to the don-tuco-agent Lambda without touching the stack,
# optionally setting env vars while keeping every other one.
# Usage:
#   scripts/push-code.sh                         # code only
#   scripts/push-code.sh +50760000000            # code + OWNER_WHATSAPP
#   scripts/push-code.sh --set KEY=value --set-file GOOGLE_SA_KEY=path/to/key.json
set -euo pipefail
cd "$(dirname "$0")/.."
REGION="${AWS_REGION:-us-east-1}"
FN=don-tuco-agent

SETS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --set) SETS+=("$2"); shift 2 ;;
    --set-file) SETS+=("${2%%=*}=$(python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1])), separators=(",",":")))' "${2#*=}")"); shift 2 ;;
    +*) SETS+=("OWNER_WHATSAPP=$1"); shift ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

B="$(mktemp -d)"; trap 'rm -rf "$B"' EXIT
cp -R src packs package.json node_modules "$B/"
(cd "$B" && zip -qr code.zip . -x code.zip)
aws lambda update-function-code --region "$REGION" --function-name "$FN" \
  --zip-file "fileb://$B/code.zip" --no-cli-pager --query LastModified --output text
aws lambda wait function-updated --region "$REGION" --function-name "$FN"

if [ ${#SETS[@]} -gt 0 ]; then
  aws lambda get-function-configuration --region "$REGION" --function-name "$FN" \
    --query Environment.Variables --output json > "$B/current.json"
  python3 - "$B/current.json" "$B/env.json" "${SETS[@]}" <<'PY'
import json, sys
v = json.load(open(sys.argv[1])) or {}
for kv in sys.argv[3:]:
    k, _, val = kv.partition("=")
    v[k] = val
json.dump({"Variables": v}, open(sys.argv[2], "w"))
print("setting:", ", ".join(kv.partition("=")[0] for kv in sys.argv[3:]))
PY
  aws lambda update-function-configuration --region "$REGION" --function-name "$FN" \
    --environment "file://$B/env.json" --no-cli-pager --query LastUpdateStatus --output text
  aws lambda wait function-updated --region "$REGION" --function-name "$FN"
fi
echo "deployed"
