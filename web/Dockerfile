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

# The migrations and the tools that run and check them. Kept so the schema can
# be brought up from the same image that serves the application, rather than
# from a laptop that happens to have the repository:
#   docker run --rm --env-file .env <image> npx drizzle-kit migrate
#   docker run --rm --env-file .env <image> node scripts/preflight.mjs
COPY --from=build /srv/drizzle ./drizzle
COPY --from=build /srv/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /srv/scripts ./scripts
COPY --from=build /srv/node_modules/drizzle-kit ./node_modules/drizzle-kit
COPY --from=build /srv/node_modules/.bin ./node_modules/.bin

# Nothing here needs root.
USER node

EXPOSE 3000

# Reports down when the database is unreachable, which is the failure worth
# taking an instance out of rotation for.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
