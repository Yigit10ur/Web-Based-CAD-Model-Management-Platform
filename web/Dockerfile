# The web application.
#
# Two stages: one that has the toolchain and the source, one that has neither.
# What ships is the standalone server Next.js traces -- the server plus the
# dependencies it actually reaches -- rather than the whole node_modules tree
# and a hope that the install on the target machine matches the one the build
# was tested against.

FROM node:22-slim AS build

WORKDIR /srv

# Dependencies first, so a source change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Asks next.config.ts for the self-contained server. Off by default, so the
# hosted deployment keeps building the way it always has.
ENV BUILD_STANDALONE=1

# The build reads no secrets: every value this application needs is read at
# request time, so one image runs in any environment. Do not add build
# arguments for configuration -- that is how a production secret ends up in an
# image layer.
RUN npm run build


# The one-shot commands -- bringing the schema up, checking the configuration
# -- run from here, where the toolchain and the whole of node_modules still
# are.
#
# They cannot run from the image that serves the site. That one carries the
# self-contained server Next.js traced, and a trace only follows what the
# application imports: `drizzle-kit` wants esbuild, `preflight.mjs` wants the
# postgres driver, and neither is reachable from a page. Both were missing, and
# both are commands the install instructions open with.
FROM build AS tools
WORKDIR /srv
CMD ["node", "scripts/preflight.mjs"]


FROM node:22-slim AS run

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

WORKDIR /srv

# The three pieces of a standalone build. `static` and `public` are not traced
# into it, because they are served rather than imported.
COPY --from=build /srv/.next/standalone ./
COPY --from=build /srv/.next/static ./.next/static
COPY --from=build /srv/public ./public

# Nothing here needs root.
USER node

EXPOSE 3000

# Reports down when the database is unreachable, which is the failure worth
# taking an instance out of rotation for.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
