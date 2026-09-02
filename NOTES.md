# Working notes

What was built, why it was built that way, and what is still missing. Written
to be picked up cold: the decisions below are the ones that would otherwise
have to be re-derived from the code, and the measurements are the ones nobody
should have to take twice.

Started 2026-08-24. This snapshot: 2026-09-02, `main` at 53 commits.

---

## Where it is

Live at <https://ehsimcad.vercel.app>. Web on Vercel
(`fra1`), Postgres and object storage on Supabase (Frankfurt), conversion on
GitHub Actions. Nothing runs between uploads, so nothing is billed.

332 tests pass: 292 in `web` (vitest, against an in-process Postgres), 40 in
`converter` (pytest; the geometry ones skip where OCCT is not installed, which
is CI).

---

## The decisions that shape everything

**The section plane can be pulled on the model, and set by number in the
panel.** Neither replaces the other: a slider is how you say "exactly halfway",
a handle is how you say "here". Dragging a handle chooses its axis too, so the
triad is a whole control rather than a step after the buttons.

A drag is not "move it by how far the mouse moved". The handle is a line in
space seen through a perspective camera, so the same movement of the hand means
a different distance depending on where the axis is and how it is foreshortened.
The plane goes to the point on the axis nearest the line the cursor is pointing
along, which is what keeps the handle under the pointer however the view is
turned.

**A face being measured is lit up: under the cursor, and again once taken.**
Measuring between two surfaces asks you to aim at a surface, and a marker at a
point does not say which surface the point is on. The highlight shares its
buffers with the part's own geometry and only draws a different range of it --
the face groups the converter already writes -- so pointing at a face costs no
new geometry. Only while a face is what is being measured: in point mode the
cursor is aiming at a corner or an edge, and lighting the face behind it would
say the wrong thing about what the next click takes.

**What is being measured is chosen before picking, not inferred from the
picks.** Inference is fine while a pair of picks has one answer; it stops being
fine the moment a circular edge can give three -- its length, its radius or its
diameter -- and nothing about the click says which was meant. Choosing first is
also what lets the cursor help: a face measurement stops snapping to the edges
around the face, which otherwise makes the face unpickable along its whole
border.

**Units are a way of reading a number, never a way of storing one.** Everything
is measured and kept in millimetres, which is what the converter writes;
millimetres, centimetres, metres and inches are conversions applied on the way
to the screen. Converting on the way in would bake a rounding into the model.

**Two faces that are not parallel still have a distance -- between the faces,
not between the planes.** The planes meet; the faces usually do not, and the
gap between a fin and the plate beside it is what people ask for. Measured on
the triangles, which for a planar face is exact: a flat face tessellates into
triangles that lie on it and tile it. The search skips any pair of triangles
whose bounding boxes are already further apart than the best found, seeded from
the two nearest each other's centres -- without the seed there is nothing to
compare against and nothing gets skipped. That took 2000 triangles against 2000
from 897 ms to 0.68 ms, which is the difference between a measurement and a
freeze.

**Parallel means within a degree, not within a rounding error.** The threshold
was eight hundredths of a degree, which no real pair of faces satisfies -- the
tool refused to measure a plate's thickness and told the person to measure an
angle instead, which is the wrong answer to the commonest question there is. A
degree is where a pair of faces stops being a gap and starts being a wedge:
across a 100 mm face that is 1.7 mm of difference between one end and the
other. Past it the refusal names the angle, so a mis-click and a tapered part
can be told apart without guessing.

**Two flat faces are measured between the surfaces, not between the clicks.**
Picking opposite sides of a 10 mm plate 30 mm apart along the face reads
31.6 mm point-to-point, which looks entirely reasonable and is wrong. The
normal comes from the B-rep; the point comes from the click, and for a plane
that is exact too -- a flat face tessellates into triangles that lie on it.
That is true of no other kind of face, which is why curved ones are refused
rather than approximated: a cylinder's metadata gives its radius and the
direction of its axis but never where that axis is.

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

**Standard views are ours, and so is the axis gizmo.** Front, back,
left, right, top, bottom and isometric are named in the toolbar, and the six
faces of them are on the indicator in the corner, which is drawn here rather
than by drei so that clicking a head reaches code that knows where the model
is. All of them place the camera at the distance already zoomed to -- asking for the top view of a
feature gives that feature from above, not the assembly again. Top and bottom
are the only views whose up is not Z: looking straight down the up axis leaves
a camera with no orientation to take, and that produces no error and no
picture.

**The mouse is a CAD mouse, not a web one.** Middle drag rotates, Ctrl pans,
Shift zooms, Alt rolls, `f` fits -- the SolidWorks layout, because that is what
is already in the hands of the people using this. The left button is left for
selecting: three.js' default gives it rotation, and a left drag that also
rotated would take the click somebody meant for a face. The layout is printed
in the toolbar, because a left button that does not move the camera is not
guessable and reads as a broken viewer.

The wheel zooms towards the pointer, not the middle of the screen. Zooming at
the centre means panning afterwards every single time, which for an application
whose whole purpose is looking closely at one feature is the wrong default --
and it is not what a CAD package does.

Note the family split, if this is ever revisited: Inventor and Fusion use the
middle button to *pan* and Shift+middle to rotate -- the opposite. Picking one
means the other feels wrong, and there is no layout that feels right to both.

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

Peak memory in the worker: 435 MB for the 500-part assembly, 344 MB for a
three-part one. Almost all of it is OpenCascade being loaded, so the fixed cost
dominates the model -- which is why 2 GB is enough for a machine running both
processes.

Frame rate on an M1 Pro: 120 fps, which is the display's ceiling rather than
the application's, with 20 MB of GPU memory. The 500-part model was reported
smooth; no figure was taken.

**The cap that fills a cut face goes on the part, and is sized to the part.**
It used to go at `Plane.coplanarPoint` -- the point on the plane nearest the
world *origin* -- and be sized to the whole model. Both were wrong for the same
reason: an assembly a metre and a half from the origin had its caps drawn
beside it, and the cut read as hollow. A plane cuts a box in a section no wider
than the box's own diagonal, so that is the size; the old one meant every part
drawing a quad the size of the assembly.

**Sectioning is only paid for where the plane actually cuts.** With a section
on, a part costs two extra passes over its geometry, a capping quad and a
stencil clear -- five draws instead of two. A plane through an assembly crosses
a handful of its parts, so each part is tested against the plane first: behind
it, nothing is drawn at all; in front, no cap and no stencil. Measured on the
500-part assembly, cutting through the middle:

| axis | crossing | in front | discarded | draws | stencil clears |
|---|---|---|---|---|---|
| X | 17 | 247 | 236 | 2500 → 579 | 500 → 17 |
| Y | 0 | 253 | 247 | 2500 → 506 | 500 → 0 |
| Z | 100 | 400 | 0 | 2500 → 1300 | 500 → 100 |

The last column is the one that mattered: a full stencil-buffer clear per part
per frame.

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
- **three-mesh-bvh renumbers the triangles unless told not to.** Building the
  tree sorts them spatially and rewrites the geometry's index in place -- on a
  real assembly, 2939 of 2952 indices moved. The picture is identical, and
  every mapping from a triangle to a B-rep face is wrong: `face_groups` is read
  by triangle number, and so is every raycast hit. It surfaced only once a face
  was drawn, as a highlight lighting up triangles from all over the part; until
  then it was silently picking the wrong surface to measure. `indirect: true`
  keeps its own ordering and leaves the mesh alone.
- **Presigned URLs are signed per request**, so the browser cache key changes on
  every open and the whole payload is downloaded again.
- **drei's axis gizmo moves the camera by the distance to the world origin**,
  not to what is being looked at -- `camera.position.distanceTo(new Vector3())`,
  where that vector is declared and never assigned. Clicking an axis on an
  assembly sitting 1.7 m from the origin threw the camera 1.7 m past it and
  left a blank screen. Third member of the same family as the fixed camera and
  the fixed marker size: code that assumes the model is at the origin, which
  CAD data is not.
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

**No angle measurement between edges**, though the data for it is exported.
Between two flat faces there is one, because a pair of faces that meet has an
angle and no distance. The
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
| `lib/views.ts` | The named standard views -- direction, which way is up, where the camera goes -- and which view each head of the axis indicator asks for. Ours because drei's version measures from the origin. |
| `lib/proximity.ts` | How close two surfaces come: point-to-triangle, segment-to-segment, triangle-to-triangle, and the search over two sets of them. |
| `lib/measure.ts` | The six measurement types, what each one refuses and why, and the units a reading can be shown in. Refuses curved faces rather than approximating them. |
| `lib/navigation.ts` | The mouse layout, and a model of the controls' own modifier rule so we can aim through it rather than fight it. |
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
| `components/viewer/FaceHighlight.tsx` | One B-rep face drawn on top of the part it belongs to, sharing the part's buffers and changing only the range drawn. |
| `components/viewer/SectionHandles.tsx` | The triad on the cut. Follows the drag on the canvas rather than through R3F's pointer events, which only reach the object under the cursor -- and the cursor leaves a thin arrow immediately. |
| `components/viewer/MeasurePanel.tsx` | The measurement menu: what to measure, clearing, and the unit. |
| `components/viewer/AxisGizmo.tsx` | The axis indicator in the corner. Drawn rather than borrowed, because the borrowed one moved the camera itself and moved it wrongly. |
| `components/viewer/Navigation.tsx` | Renders the orbit controls and rewrites their buttons as modifiers are held; also roll, fit, and swinging to a named view. |
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
