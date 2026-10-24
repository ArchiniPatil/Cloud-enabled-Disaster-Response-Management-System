#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Optional managed-network support. Proxy credentials and CA contents are not
# written into image layers; Docker's special proxy arguments remain transient.
args=()
if [ -n "${HTTPS_PROXY:-}" ]; then
  args+=(--network=host --build-arg HTTPS_PROXY --build-arg HTTP_PROXY --build-arg NO_PROXY=)
  proxy_mapping=$(python3 - <<'PY'
import os,socket,urllib.parse
host=urllib.parse.urlsplit(os.environ['HTTPS_PROXY']).hostname
print(host+':'+socket.gethostbyname(host))
PY
)
  args+=(--add-host "$proxy_mapping")
fi
if [ -n "${NODE_EXTRA_CA_CERTS:-}" ] && [ -r "$NODE_EXTRA_CA_CERTS" ]; then
  args+=(--secret "id=build_ca,src=$NODE_EXTRA_CA_CERTS")
fi
docker build "${args[@]}" -t "${IMAGE_TAG:-response-local:verified}" .
