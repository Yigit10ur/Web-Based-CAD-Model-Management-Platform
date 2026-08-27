# Deploying

## What runs where

| Piece | Host | Why there |
|---|---|---|
| `web` | Vercel | It is a Next.js app; nothing else is simpler |
| `converter` | Fly.io | Needs a container, and Fly builds the image remotely |
| Postgres, object storage | Supabase | Already in use, and one account covers both |

## Before you start

You will need a Vercel account, a Fly.io account, and a GitHub OAuth app. All
three are free to create. Everything below is done by you rather than by an
agent, because it involves signing in to accounts and handling secrets.

## 1. A separate production database

**Do not deploy against the Supabase project you develop on.** It holds test
uploads and half-finished migrations, and sharing it means local experiments
land in the live system. Create a second project.

Supabase's free plan allows two projects per organisation, so this costs
nothing.

1. New Supabase project, region **Frankfurt (eu-central-1)**
2. Turn off **Enable Data API** and **Automatically expose new tables**, as on
   the development project — the application connects over Postgres directly
3. **Storage → New bucket** named `cad-models`, private
4. **Storage → S3 Connection**: enable the S3 protocol and create an access key
5. Apply the schema from your machine. Put the connection string in a file
   rather than on a command line -- a long command with a password in the
   middle of it is the thing to get wrong once:

   ```bash
   cd web
   cp .env.prod.example .env.prod     # then fill in DATABASE_URL
   npm run db:migrate:prod
   npm run db:check:prod
   ```

   `.env.prod` is gitignored and is read only by the `:prod` scripts; Next.js
   never loads it, so nothing can pick it up by accident. `db:check:prod`
   prints which tables exist and how many migrations ran, without printing the
   connection string.

   Expected:

   ```
   host: aws-0-eu-central-1.pooler.supabase.com:6543

     ✓  accounts
     ✓  model_versions
     ...
   migrations applied: 3

   Schema is complete.
   ```

## 2. A GitHub OAuth app

**Production has no other way in.** The password-less development sign-in is
excluded from production builds, so without this the sign-in page will tell
visitors that no provider is configured.

1. <https://github.com/settings/developers> → **New OAuth App**
2. Homepage URL: `https://<your-vercel-domain>`
3. Authorization callback URL:
   `https://<your-vercel-domain>/api/auth/callback/github`
4. Keep the client ID and generate a client secret

The callback URL has to match exactly, including the scheme and any trailing
path. This is the single most common reason a first deploy cannot sign in.

## 3. Web, on Vercel

Import the repository, then set **Root Directory** to `web` — the repository
holds three projects and Vercel needs to be told which one. Without it the
build fails with "No Next.js version detected": it is looking at a repository
root that has no `package.json`.

The function region is pinned to Frankfurt in `web/vercel.json`, next to the
database and the storage bucket. Left at the default, every request would run
in Washington and cross the Atlantic several times per page — the catalogue
alone makes three sequential queries. It is set in the repository rather than
in the dashboard so that it is reviewed like any other change and cannot be
lost in a project's settings.

Environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Production pooler URI, port 6543 |
| `STORAGE_ENDPOINT` | `https://<ref>.storage.supabase.co/storage/v1/s3` |
| `STORAGE_REGION` | e.g. `eu-central-1` |
| `STORAGE_BUCKET` | `cad-models` |
| `STORAGE_ACCESS_KEY_ID` | From the production project |
| `STORAGE_SECRET_ACCESS_KEY` | From the production project |
| `AUTH_SECRET` | A fresh one: `npx auth secret` |
| `AUTH_GITHUB_ID` | From the OAuth app |
| `AUTH_GITHUB_SECRET` | From the OAuth app |

Use a **different** `AUTH_SECRET` from development. A secret that has been in a
file on a laptop is not a production secret.

## 4. Converter, on Fly

```bash
cd converter
fly apps create cad-converter          # `fly launch` would rewrite fly.toml

cp .env.fly.example .env.fly           # then fill it in
grep -vE '^#|^$' .env.fly | fly secrets import --stage

fly deploy --remote-only
```

Secrets are piped from a file rather than passed as arguments: `fly secrets
set KEY=value` leaves the value in your shell history, and a storage secret
does not belong there. `.env.fly` is gitignored, and you can delete it once the
secrets are set — Fly keeps them.

`fly deploy` builds the image on Fly's builder, so this works from a machine
with no Docker installed.

The worker needs no `AUTH_*` values: it never serves a request and has no users.

**This image has never been built.** Expect the first `fly deploy` to be where
you find that out. The likely trouble is the `cadquery-ocp` wheel: it is large,
and the build may need more memory than the default builder gives it
(`fly deploy --build-only --remote-only` to iterate faster).

## 5. Check it works

```bash
fly logs
```

The worker announces itself and then says nothing while the queue is empty:

```
worker started, polling every 5.0s
```

If OCCT did not install, it exits immediately with a message saying so rather
than accepting jobs it cannot do.

Then, in the browser: sign in with GitHub, upload a STEP file, and watch it go
`queued` → `converting` → `ready`.

## Running the converter only when you need it

A Fly machine is billed while it runs, and the worker's design is to poll --
so left alone it runs, and bills, around the clock to wait for uploads that
mostly are not coming. For a project that converts a handful of files a week,
that is the wrong trade.

So the converter is normally scaled to zero:

```bash
cd converter
fly scale count worker=1 --app cad-converter --yes    # before converting
fly scale count worker=0 --app cad-converter --yes    # after
```

It takes about twenty seconds to come up and then works through whatever has
accumulated. **Nothing is lost while it is down**: an upload still reaches
storage and still gets its row, and simply sits at `queued` until a worker
claims it. The catalogue shows that status honestly rather than pretending the
file failed.

The alternative is to run the worker on your own machine against the
production database, which costs nothing at all:

```bash
cd converter && ./.venv/bin/python -m app.worker
```

It reads `../web/.env.local` by default, so pass the production values
explicitly if that is what you want it to work on.

A third option, not built: give the worker an HTTP endpoint, have the web app
call it after an upload, and let Fly start and stop the machine around each
request. That would make the cost proportional to the work instead of to the
calendar, and it is the right answer if this ever converts files regularly.

## Afterwards

**Migrations** are run by hand against production, the same way as in step 1.
They are not part of the deploy: a schema change that runs automatically is a
schema change nobody read.

**Every merge to `main` deploys the web app.** CI runs on every pull request,
so what reaches `main` has already been linted, typechecked, tested and built.
The converter deploys only when you run `fly deploy`.

**Secrets live in Vercel and Fly**, never in the repository. `web/.env.local`
is for your machine and is gitignored.
