# RDS TLS trust

The repository includes the official AWS RDS CA bundle at `certs/rds-global.pem`. Refresh it when needed with `node scripts/fetch-rds-ca.mjs` (Windows, macOS or Linux). The helper downloads only from `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem` with TLS verification, parses every PEM certificate, and replaces the bundle only after validation. `bash scripts/fetch-rds-ca.sh` is the legacy equivalent.

The bundle is copied into ECS and Lambda artifacts; rebuild them after refreshing. PostgreSQL certificate validation stays enabled. Do not substitute an unverified CA or disable TLS validation.
