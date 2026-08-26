# agent

Translates native Autodesk Inventor files to STEP, using Inventor itself.

The rest of this project cannot read `.ipt` or `.iam`: they are proprietary and
no open source library reads them reliably. This agent closes that gap with the
one thing that reads them perfectly — a machine that already has Inventor
installed and licensed.

## How it fits

```
user uploads .ipt / .iam / .zip
        ↓
  awaiting_translation      the platform routes it here instead of the queue
        ↓
  this agent claims it, exports STEP with Inventor, uploads it
        ↓
      queued               the normal converter takes over from here
        ↓
  glb + metadata           assembly tree, exact mass properties, measurement
```

Everything downstream of the STEP is unchanged, so a translated assembly is
inspected exactly like one that was exported by hand.

## What the agent can see

Only what it is given. It holds one secret — the platform token — and receives
a presigned URL to read the upload from and another to write the STEP to. It
has no database credentials and no storage keys, which matters because this
runs on a workstation rather than in the deployment.

## Requirements

- Windows, with **Autodesk Inventor installed and licensed**. The Apprentice
  Server is not enough: it reads files but does not export STEP.
- Python 3.11 or newer

## Setup

```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

set PLATFORM_URL=https://your-deployment.example.com
set AGENT_TOKEN=<the same value as AGENT_TOKEN in the web app>
python translate.py
```

Leave it running. It polls, and does nothing while the queue is empty.

For unattended operation, run it as a Windows service (NSSM or Task Scheduler
with "run whether user is logged on or not"). Inventor is started invisibly and
in silent mode so it cannot block on a dialog, but it does need a session that
can host it.

## Uploading an assembly

An `.iam` holds references to part files and no geometry of its own. Uploaded
alone it would translate to an empty model, so **assemblies must be uploaded as
a `.zip`** — use Inventor's **Pack and Go**, which writes the assembly together
with everything it references, and zip that folder.

A single part can be uploaded as a bare `.ipt`.

An archive holding more than one assembly is rejected rather than guessed at.

## Verification status

**This script has never been run.** It was written against the Inventor API
documentation on a machine with neither Windows nor Inventor, and the first
person to run it should expect to correct something. The two most likely
places:

- `STEP_TRANSLATOR_ID` — the translator add-in identifier. Confirm it under
  Tools → Add-Ins.
- `_set_option` — pywin32 exposes Inventor's `NameValueMap.Value` differently
  across builds, so the helper tries both forms.

Everything on the platform side of the boundary — routing, claiming, the
guards against two agents taking one file — is covered by tests and does not
depend on this script being right.
