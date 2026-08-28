# Deploying

## What runs where

| Piece | Host | Why there |
|---|---|---|
| `web` | Vercel | It is a Next.js app; nothing else is simpler |
| `converter` | GitHub Actions | Too large for a function, and this needs no new account |
| Postgres, object storage | Supabase | Already in use, and one account covers both |

## Before you start

You will need a Vercel account and a GitHub OAuth app, both free. There is no
account to open for the converter: it runs as a GitHub Actions job in this
repository. Everything below is done by you rather than by an agent, because it
involves signing in to accounts and handling secrets.

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

## 4. Converter

Nothing to deploy. The workflow is in the repository; it needs the secrets
listed under **Where the converter runs** below, and the two Vercel values that
let the web application start a run.

## 5. Check it works

In the browser: sign in with GitHub, upload a STEP file, and watch it go
`queued` → `processing` → `ready`. The Actions tab shows the run that did it.

A run that finds nothing to do says so and stops:

```
draining the queue
queue empty after 0 job(s)
```

If OCCT did not install, the worker exits immediately with a message saying so
rather than accepting jobs it cannot do.

A file that stays `queued` means no run was started: check that
`GITHUB_DISPATCH_TOKEN` is set in Vercel and still valid. The file is not lost
— start a run by hand and it will be picked up.

## Where the converter runs

Nowhere, between uploads. A GitHub Actions run is started when a file is
uploaded, converts everything waiting and exits.

That is not the obvious design, so here is why. OpenCascade is 221 MB
installed, and Vercel's function bundle limit is 250 MB -- the geometry kernel
alone does not fit beside the web application, before any of its dependencies.
The usual answer is a container host. Where none is available, a CI runner is
the next thing that can hold a package that size: this repository is public, so
Actions minutes are free and unmetered.

The queue is unchanged and remains the source of truth. `FOR UPDATE SKIP
LOCKED` does not care whether two workers are two containers or two CI runs
that overlapped, and an upload that never manages to summon one waits in the
queue rather than being lost.

**This is a bridge, not a destination.** Actions is a CI system, not a job
queue: expect a minute or two before a run starts, and no guarantees about
when. If the project ever converts files regularly, move the worker to a
container host -- it is a change to one workflow file, because the worker
already runs anywhere the database is reachable.

### What has to be configured

The workflow needs the production database and bucket, as repository secrets:

```bash
gh secret set DATABASE_URL --body "..."
gh secret set STORAGE_ENDPOINT --body "..."
gh secret set STORAGE_REGION --body "..."
gh secret set STORAGE_BUCKET --body "..."
gh secret set STORAGE_ACCESS_KEY_ID --body "..."
gh secret set STORAGE_SECRET_ACCESS_KEY --body "..."
```

Secrets are not readable from a workflow log or from a fork, but anyone who can
push to the default branch can read them by writing a workflow that does. On a
public repository with one collaborator that is the same trust as deploying,
but it is worth knowing rather than discovering.

The web application needs to be able to start a run, which is two more values
in Vercel:

- `GITHUB_DISPATCH_TOKEN` -- a fine-grained personal access token for this
  repository with **Contents: read and write**, which is the permission
  `repository_dispatch` is filed under.
- `GITHUB_REPOSITORY` -- `owner/repo`.

Leave both unset in development. Without them the web application does not try
to summon anything, which is right: locally you run the worker yourself.

### Running it by hand

Either from the Actions tab (**convert** -> Run workflow), or against the
production database from your own machine:

```bash
cd converter && ./.venv/bin/python -m app.worker --drain
```

`--drain` converts what is waiting and exits; without it the worker polls for
ever, which is what a permanent host would run. It reads `../web/.env.local` by
default, so pass the production values explicitly if that is what you mean.

## Afterwards

**Migrations** are run by hand against production, the same way as in step 1.
They are not part of the deploy: a schema change that runs automatically is a
schema change nobody read.

**Every merge to `main` deploys the web app.** CI runs on every pull request,
so what reaches `main` has already been linted, typechecked, tested and built.
The converter has nothing to deploy: a run checks the repository out and
installs what it needs, so `main` is what converts your files.

**Secrets live in Vercel and in the repository's Actions secrets**, never in
the repository itself. `web/.env.local` is for your machine and is gitignored.
