# MinIO TLS certificates

Docker Compose uses plain HTTP on the loopback-bound development ports by default. For a TLS-enabled
self-hosted deployment, place `public.crt` and `private.key` in this directory and change the MinIO,
bucket-initialization, and API endpoints to `https://`. Use a certificate whose SAN covers the MinIO
hostname. Production deployments must not expose object storage without TLS.
