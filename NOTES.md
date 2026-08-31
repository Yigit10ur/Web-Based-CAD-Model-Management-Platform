# Working notes

What was built, why it was built that way, and what is still missing. Written
to be picked up cold: the decisions below are the ones that would otherwise
have to be re-derived from the code, and the measurements are the ones nobody
should have to take twice.

Started 2026-08-24. This snapshot: 2026-08-31, `main` at 47 commits.

---

## Where it is

Live at <https://ehsimcad.vercel.app>. Web on Vercel
(`fra1`), Postgres and object storage on Supabase (Frankfurt), conversion on
GitHub Actions. Nothing runs between uploads, so nothing is billed.

194 tests pass: 154 in `web` (vitest, against an in-process Postgres), 40 in
`converter` (pytest; the geometry ones skip where OCCT is not installed, which
is CI).

---

## The decisions that shape everything

**Triangles are for drawing; numbers come from the B-rep.** The browser is sent
a mesh, but every dimension, volume and centre of mass is read from the original
solid geometry. A measurement is either exact or it is not offered: a mesh
import carries no snap data at all and the viewer says so rather than quietly
measuring off triangle corners.

**Two geometry paths, labelled honestly.** `geometry_source` is `brep` or
`mesh`, and the second reports measured values, a null volume when the mesh is
not watertight, and no snapping.

**Nothing about the scene is a constant.** Camera position, clipping planes,
grid spacing, measurement marker size and dash lengths are all derived from the
model's bounding box. This was learned the hard way: a fixed camera missed a
4 mm part sitting a metre from the origin, and a fixed 0.6 mm marker was a
boulder on it.

**The camera is told which way is up, rather than the geometry being rotated.**
CAD data is Z-up. Rotating the model into three.js' Y-up convention would put
every bounding box and centre of mass in the properties panel into a different
frame from the thing on screen.

**The queue is a Postgres table**, claimed with `FOR UPDATE SKIP LOCKED`. It
does not care where its workers run, which is what made moving them from a
container host to CI a change to one file.

**The converter runs on GitHub Actions**, started per upload. OpenCascade is
221 MB installed against Vercel's 250 MB function bundle limit, so it cannot
live beside the web application; a container host would need an account that
was not available. This is a bridge, not a destination.

**Access checks return null, so callers answer 404 rather than 403.** Telling
someone a model exists but is not theirs leaks more than it needs to.

**An invitation only opens for a proved address.** Invitations are matched by
email, so an unproved account claiming one would make sharing forgeable.
Arriving through an OAuth provider counts as proof and is recorded; a password
account proves it by following a link. The check lives inside
`claimInvitations` so there is one of it.

**Passwords use scrypt from `node:crypto`.** Memory-hard, in the standard
library, and no native module -- which matters on a serverless host, where a
package that compiles on a laptop and not on the deployment target is a
deployment you find out about at the worst moment. ~70 ms per attempt.

**A wrong password and an unknown address get the same sentence, in the same
time.** An unknown address is still checked against a dummy hash, or the
response time is a list of which addresses are worth attacking.

**One-time links are stored hashed and spent on success, not on attempt.** A
reset link is a password while it lives. Spending it on a password that was then
refused would cost somebody their only way back in for the sake of a typo.

**The catalogue name prefers the name inside the CAD file, but only when the two
share a word.** The point is repairing a damaged file name -- one upload arrived
with every Turkish character truncated to the low byte of its code point -- not
overruling the person who chose it. The same test disposes of
`Open CASCADE STEP translator 7.9 1`, which is what an unnamed STEP file
declares.

**The design is light-only.** The starter template's dark-scheme override was
removed: it changed only the inherited body colour, which left every text input
drawing near-white on white for anyone whose system was set to dark.

**There is no public-visibility toggle.** The column exists, but "public" here
means every GitHub account on the internet, not everyone in the company.

**Migrations are run by hand, before the merge that needs them.** A schema
change that runs automatically is a schema change nobody read.

**Deleting sweeps storage first and the row second.** The row is the only
record of which keys belonged to a model, so a storage error after it would
leave files nothing points at -- invisible, unreachable, still paid for. This
way a failure leaves everything as it was, and the retry converges, because
deleting a key that is already gone succeeds. The cost is the opposite failure:
files gone and a row that survived, which is visible and can be deleted again.

**Who may delete is one pure function, called by both the route and the
catalogue.** A button that appears for someone the route will refuse is not a
permission check, it is a trap. Same shape as the section pick rule: the
decision lives in `lib/`, the component turns a click into a call.

**The section direction is a unit vector; X, Y and Z are the three that happen
to be named.** One code path rather than two, and a test pins that the named
axes produce the identical plane as the same direction handed in by hand. The
slider stays 0..1 across the model, with the travel taken by projecting the
bounding box onto the direction instead of reading one of its sides.

**A direction borrowed from a face comes from the B-rep, never from the
triangle that was hit.** Same rule as measurement, applied to one more thing: a
tessellated face is a fan of triangles whose normals differ from the surface,
and a cut a fifth of a degree off the face it was taken from is worse than no
feature at all. Only planar faces can lend one -- a cylinder has a different
normal at every point.

---

## Measured

| | 11 parts (bogie) | 500 parts (synthetic) |
|---|---|---|
| Triangles | 82,572 | 157,600 |
| Conversion | 27 s | 4.8 s |
| Draw calls | 22 | **1,000** |
| Tree rows | 8 | 502 |
| glb / metadata | 1.60 / 2.00 MB | 1.74 / 1.88 MB |

Frame rate on an M1 Pro: 120 fps, which is the display's ceiling rather than
the application's, with 20 MB of GPU memory. The 500-part model was reported
smooth; no figure was taken.

**The limit is part count, not triangle count** -- each part costs a solid and
an edge set, so two draw calls. The first lever, if one is needed, is merging
edge lines by material, which halves them.

**The metadata sidecar is bigger than the geometry.** That is the price of the
snap data that makes measurement exact. Compressing it (`Content-Encoding:
gzip`) would take 2 MB to roughly 250 KB. Not urgent: on the connections in use
the whole 3.6 MB arrives in under a second.

A GitHub Actions run costs ~20 s to install OpenCascade plus the conversion
itself, so an upload is ready in well under a minute.

---

## Things that cost hours and should not cost them twice

- **Restart the dev server after a schema change.** `db` is a module-level
  drizzle instance that reads the schema once; server-side HMR does not
  recreate it, so a new table reads as `undefined` and a new column simply does
  not come back. Tests pass throughout, because they build a fresh connection.
- **A hidden browser pane never renders.** `requestAnimationFrame` stops, and
  React Three Fiber will not even create the WebGL context for a canvas it
  measures as zero-sized. An empty 3D view there is the harness, not the code.
- **`AddShape` returns the existing label for a shape it already holds.** Five
  hundred names written to five prototypes leaves five labels named after
  whichever part was last.
- **`'İ'.toLowerCase()` is two code points**, `i` plus a combining dot. Fold
  before lowercasing, then strip combining marks.
- **`GLTFLoader` strips `.` from node names**, so part ids use `_`.
- **three.js creates the context without a stencil buffer**, and the section cap
  needs one, or the test passes everywhere and paints the whole screen.
- **Presigned URLs are signed per request**, so the browser cache key changes on
  every open and the whole payload is downloaded again.
- **Local and production are two different Supabase projects.** `web/.env.local`
  is one; Vercel and the Actions secrets are another, the same one
  `converter/.env.fly` holds. Nothing drains the local queue, so an upload made
  against a dev server sits `queued` for ever with nothing wrong with the file,
  the converter or the queue. Ask which environment is on screen before reading
  the code. `converter/.venv/bin/python -m app.worker --drain` empties it.
- **Gate a feature on the data, not on a label.** The `face` button was hidden
  wherever `geometry_source !== 'brep'` -- including the bundled sample, whose
  metadata predates that field and has a planar face on every part. The
  precondition was never the label; it was whether there is a flat face to
  borrow from.
- **Renaming the repository breaks the conversion dispatch until Vercel is
  told.** `GITHUB_REPOSITORY` is what the dispatch URL is built from, GitHub
  answers a renamed repository with a redirect, and a redirected POST does not
  stay a POST. It fails silently, by design: a failed dispatch is deliberately
  not an upload failure.

---

## What is missing

**A revision cannot be deleted on its own.** A model goes whole, with every
revision and every file. Deleting one revision was left out deliberately: it
leaves "which one is current?" answered differently depending on which was
removed. Deleting a model while its conversion is running is the one gap --
storage is swept before the worker writes its output, so two files can be
orphaned in the seconds a conversion takes.

**No mail provider is configured -- the largest hole now, and the one a real
user meets first.** The flows are built and tested, but with no
`MAIL_API_KEY` the messages are written to the log. Consequences: a forgotten
password cannot be recovered, and a password account cannot open projects
shared with it. GitHub accounts are unaffected. Sending to arbitrary addresses
also needs a domain verified with the provider by DNS record -- that part is not
code.

**No thumbnails or search.** `thumbnail_key` exists and is unused. The
catalogue has no pagination either, which is the real scaling limit.

**Sessions survive a password reset.** JWT strategy; an old cookie stays valid
until it expires.

**No angle measurement**, though the data for it is already exported. The
section plane itself now takes any direction: three named axes, a direction
borrowed from a flat face, and two dials to rotate away from either.

**The whole glb loads before anything is drawn.** Fine at 1.7 MB, not at 50 MB.

**The Dockerfile has never been built.** Nothing uses it now that Actions
installs the package directly; it is the way onto a container host if one ever
becomes available.

**Native CAD formats are out of scope.** `.ipt`, `.iam`, `.sldprt` need a
commercial SDK. The honest framing: every one of those systems exports STEP,
which is the industry exchange format and is fully supported.

**Renaming reaches further than the two names.** The repository is `ehsimcad`
and the site is <https://ehsimcad.vercel.app>; the old domain 308s to it, which
keeps every link already handed out alive. Three things had to move with the
names and none of them are in this repository: `GITHUB_REPOSITORY` in Vercel,
which the dispatch that starts a conversion is built from -- a renamed
repository answers with a redirect, and a redirected POST does not stay a POST;
`SITE_URL`, if it is set, which is what links in email point at; and the GitHub
OAuth application's callback URL, which is tied to the domain, so signing in
with GitHub breaks the moment the domain moves without it.

---

## The files

### Converter (`converter/`)

| File | What it is |
|---|---|
| `app/cad/occt.py` | The B-rep pipeline: reads STEP/IGES, walks the XCAF tree, tessellates, extracts face groups, edges and snap geometry. Uses `AddOptimal_s` with a zero gap for bounding boxes -- the default inflates them. |
| `app/cad/mesh.py` | The mesh path. Measured properties, null volume when not watertight, sharp edges by dihedral angle, no snap data. |
| `app/models.py` | The contract between converter and viewer: tree, per-part properties, face groups, snap geometry, `geometry_source`, `declared_name`. |
| `app/pipeline.py` | Format dispatch and the deflection rule, which scales with the bounding box. |
| `app/worker.py` | The polling queue, plus `--drain` for a runner started per upload. Also decides whether the CAD file's own name should replace the uploaded file name. |
| `app/storage.py` | S3-compatible download and upload. |
| `app/config.py` | Settings, deliberately sharing the web application's variable names. |
| `app/cli.py`, `app/main.py` | A one-shot convert command, and a health endpoint. |
| `scripts/make_fixture.py` | Generates the IGES test fixture. |
| `scripts/make_large_assembly.py` | Generates an assembly of N parts, repeated or distinct, for scale measurement. |
| `tests/` | Geometry against analytically known values; the naming rule; the mesh path's honesty about what it cannot measure. |

### Web — geometry and viewer (`web/src/`)

| File | What it is |
|---|---|
| `lib/metadata.ts` | The contract, restated in TypeScript. |
| `lib/snap.ts` | Vertex over edge over face, projected onto the true circle rather than the drawn polygon; ignores anything a section plane has cut away. |
| `lib/section.ts` | The clipping plane. Any unit direction, stored 0..1 across the bounding box so one control behaves the same at any scale; its margin is symmetric, which is what makes 0.5 exactly the middle. Also the rule for which face can lend a direction, and `positionOfPoint` -- the exact inverse of `cutDistance`, which is what puts a borrowed cut *on* the face rather than near it. |
| `lib/framing.ts` | Camera, clipping planes, grid spacing and annotation sizes, all derived from the model. |
| `lib/bvh.ts` | three-mesh-bvh wiring for raycasting. |
| `components/viewer/Viewer.tsx` | The canvas: Z-up camera, stencil buffer on, local clipping on, keyed by model so a new one gets a new context. |
| `components/viewer/Model.tsx` | Draws the parts and their edges, handles selection and snapping. |
| `components/viewer/AssemblyTree.tsx` | The tree, with visibility checkboxes and repeated siblings collapsed into one row with a count. |
| `components/viewer/MeasureLayer.tsx` | Measurement lines, markers and labels. Labels are constant on screen; a dimension is an annotation, not part of the model. |
| `components/viewer/SectionControls.tsx` | The reference row (X, Y, Z, and `face` to borrow one from the model), two rotation dials, flip, centre, and the position slider with a millimetre readout. Offers `face` only where there is a flat face to borrow from. |
| `components/viewer/ClippedSolid.tsx` | The stencil-buffer cap that makes a cut read as solid material. |
| `components/viewer/PropertiesPanel.tsx` | Exact mass properties for the selected part; the explode control. |
| `components/viewer/Toolbar.tsx` | Select/measure, the warning that a mesh has nothing exact to snap to, and the hint while a section reference is being picked -- the pointer is doing something other than what the tool says, and the panel that started it is off to the side. |
| `components/viewer/ModelWorkspace.tsx` | Loads the metadata, and clears the viewer store when the model changes. |
| `store/viewer-store.ts` | Visibility, selection, tool, section, explode and measurements. Reset per model -- part ids restart at `n1_1` in every file, and a section borrowed from a face points at one the next model does not have. |

### Web — platform (`web/src/`)

| File | What it is |
|---|---|
| `db/schema.ts` | Users, accounts, projects, members, invitations, models, versions, email tokens, sign-in attempts. |
| `db/index.ts` | A lazy proxy over drizzle, so importing it does not read the environment at build time. One connection per serverless instance. |
| `lib/session.ts` | Who is asking and what they may touch. Every read and write of a model resolves through here. |
| `lib/projects.ts` | Creating projects, membership, invitations, and the verification gate on claiming them. |
| `lib/accounts.ts` | Registering and checking a password, including the lockout and the timing defence. |
| `lib/password.ts` | scrypt hashing, verification, and what makes a password unacceptable. |
| `lib/sign-in-attempts.ts` | The database-backed attempt limit; serverless has no memory to count in. |
| `lib/email-tokens.ts` | One-time links: issued random, stored hashed, spent once. |
| `lib/verification.ts` | Sending and accepting the address confirmation. |
| `lib/mail.ts` | The provider, reached over plain HTTP. Logs instead of sending when unconfigured. |
| `lib/storage.ts` | Presigned URLs, the storage key layout, and deletion -- one request per key, because every S3 implementation answers the single-object form and the batch one reports partial failure in the body rather than the status. |
| `lib/upload.ts` | The three-step upload, in one place so a new model and a new revision cannot drift apart. |
| `lib/formats.ts` | What is accepted, and the rejection message that fits the file. |
| `lib/converter.ts` | Asks GitHub to start a conversion run. Built from `GITHUB_REPOSITORY`, and silent when it fails: an upload that cannot summon a worker is still a good upload. |
| `lib/models.ts` | Who may delete a model, and deleting one. The rule is a pure function so the route and the catalogue cannot disagree about whether to draw the button. |
| `lib/env.ts` | Validated environment, including the upload size limit. |
| `auth.ts` | GitHub and password providers; marks OAuth addresses verified and claims invitations at sign-in. |
| `components/catalogue/ModelList.tsx` | The catalogue rows: aligned technical columns, status as a dot and a word, and the two-step delete whose confirmation names how many revisions go with the model. Polls only while something is converting. |
| `components/catalogue/UploadForm.tsx` | The upload button and the destination picker, shown only when there is a choice. |
| `components/catalogue/RevisionUpload.tsx` | The same upload path, aimed at an existing model. |
| `components/projects/MemberList.tsx` | Members, invitations waiting, and handing access out. |
| `components/projects/CreateProject.tsx` | Creating a project. |
| `components/auth/*.tsx` | Sign-in, register, forgot, reset, the verification banner and sign-out. |

### Web — routes and pages

Twelve API routes under `app/api/` (models, versions, projects, members,
register, password forgot/reset, verify-email resend, uploaded, assets) and ten
pages: catalogue, model, projects, project, sign-in, register, forgot, reset,
verify, and the bundled sample that needs no database.

### Root

| File | What it is |
|---|---|
| `README.md` | What the project is, in English and Turkish. |
| `ARCHITECTURE.md` / `.en.md` | The design, with dated notes recording what was verified or changed and when. |
| `DEPLOY.md` | The runbook: separate production database, environment variables, where the converter runs, and the mail provider. |
| `CONTRIBUTING.md` | Working conventions and the branching model. |
| `.github/workflows/ci.yml` | Lint, typecheck, test, build on every pull request. |
| `.github/workflows/convert.yml` | The converter, started by the web application after an upload. |

---

## Running it

```bash
cd web && npm run dev          # the application
cd converter && ./.venv/bin/python -m app.worker          # convert continuously
cd converter && ./.venv/bin/python -m app.worker --drain  # convert and stop
```

Local test accounts live only in the development database. Production
migrations are `npm run db:migrate:prod`, run before the merge that needs them.
