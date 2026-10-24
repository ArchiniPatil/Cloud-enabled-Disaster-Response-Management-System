# RDS TLS trust

Before cloud deployment, run `bash scripts/fetch-rds-ca.sh` to download the official AWS RDS CA bundle with HTTPS certificate verification. The deployment preflight refuses to proceed without this bundle. It is copied into ECS and Lambda artifacts; PostgreSQL certificate validation stays enabled.

The onboarding network currently needs `truststore.pki.rds.amazonaws.com` allowed. Do not substitute an unverified CA or disable TLS validation.
