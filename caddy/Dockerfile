# Caddy met de acme-dns-module: certificaat via DNS, zodat de planner niet open op internet hoeft.
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/acmedns

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
