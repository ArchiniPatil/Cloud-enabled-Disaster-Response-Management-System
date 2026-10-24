#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p certs
bundle_tmp=$(mktemp)
trap 'rm -f "$bundle_tmp"' EXIT
curl --proto '=https' --tlsv1.2 --fail --silent --show-error https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o "$bundle_tmp"
openssl crl2pkcs7 -nocrl -certfile "$bundle_tmp" | openssl pkcs7 -print_certs -noout >/dev/null
mv "$bundle_tmp" certs/rds-global.pem
printf 'Official AWS RDS trust bundle downloaded and parsed.\n'
