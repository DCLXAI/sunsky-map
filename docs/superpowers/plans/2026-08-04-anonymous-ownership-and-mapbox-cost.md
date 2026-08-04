# Anonymous Ownership and Mapbox Cost Protection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope every project to the anonymous visitor who created it, and stop the landing page from billing Mapbox on every visit.

**Architecture:** A Next middleware mints a 256-bit `sunsky_owner` cookie on first contact and republishes it as a request header that route handlers read; the `Project` table gains a required `ownerId` that every query filters on. The landing page's live map is replaced with a pre-rendered video plus poster image, produced through a temporary local capture route that is deleted once the assets exist.

**Tech Stack:** Next 16 (App Router, middleware), React 19, Prisma 7 with `@prisma/adapter-pg`, Postgres on Neon, Mapbox GL 3, deployed on Vercel.

## Global Constraints

- Ownership mismatches return **404, never 403** — a 403 confirms the project exists.
- The cookie value is **not signed**. Do not add an `APP_SECRET` or an HMAC.
- Cookie attributes: `httpOnly`, `sameSite=lax`, `path=/`, `maxAge` 31536000, and `secure` only when `NODE_ENV === 'production'` (localhost is plain HTTP).
- Middleware must **overwrite** the owner header with `headers.set(...)`, never `append`, so a client-forged `x-sunsky-owner` on the incoming request can never survive.
- No test framework is introduced. Verification is the committed shell script from Task 1.
- Existing commands must keep passing: `npm run build`, `npm run typecheck`, `npm run lint`.
- Never commit `.env`, `.env.local`, or the temporary capture route from Task 5. The
  rendered assets in `public/` **are** committed — they are the shipped background.

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/verify-ownership.sh` | Create | Two-cookie-jar isolation check; the executable test for this plan |
| `src/lib/owner.ts` | Create | Cookie/header names and `createOwnerId()`. No Next imports, so middleware can use it on the edge runtime |
| `src/lib/owner-server.ts` | Create | `getOwnerId()` for route handlers, reads the header via `next/headers` |
| `src/middleware.ts` | Create | Mints and republishes the owner id |
| `prisma/schema.prisma` | Modify | Adds `ownerId` and its index to `Project` |
| `prisma/migrations/<ts>_add_project_owner/migration.sql` | Create | Clears the orphan row, then adds the NOT NULL column and index |
| `src/app/api/projects/route.ts` | Modify | Filters the list and stamps new projects |
| `src/app/api/projects/[id]/route.ts` | Modify | Ownership gate on GET, PUT, DELETE |
| `src/app/(marketing)/page.tsx` | Modify | Live map background → `<video>` + poster |
| `src/components/map/MapCanvas.tsx` | Modify | Drops the now-unused `decorative` prop |
| `public/demo-poster.jpg`, `public/demo.webm` | Create | Landing background assets |

---

### Task 1: Ownership isolation check that fails today

Writing the check first proves the exposure is real and gives every later task a pass/fail gate.

**Files:**
- Create: `scripts/verify-ownership.sh`

**Interfaces:**
- Consumes: nothing.
- Produces: `scripts/verify-ownership.sh <base-url>` — exits 0 when isolation holds, non-zero with a printed reason when it does not. Later tasks run it verbatim.

- [ ] **Step 1: Write the failing test**

Create `scripts/verify-ownership.sh`:

```bash
#!/usr/bin/env bash
# Proves that one visitor's projects are invisible and untouchable to another.
set -uo pipefail

BASE="${1:-http://localhost:3000}"
JAR_A="$(mktemp)"
JAR_B="$(mktemp)"
trap 'rm -f "$JAR_A" "$JAR_B"' EXIT

fail() { echo "FAIL: $*"; exit 1; }

json_field() {
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(String(JSON.parse(d)$1))}catch{process.stdout.write('PARSE_ERROR')}})"
}

status() { # method url jar [body]
  if [ -n "${4:-}" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$1" "$2" -b "$3" -c "$3" \
      -H 'Content-Type: application/json' -d "$4"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$1" "$2" -b "$3" -c "$3"
  fi
}

echo "Base URL: $BASE"

# Give each jar its owner cookie.
curl -s -o /dev/null -c "$JAR_A" "$BASE/" || fail "A could not reach $BASE"
curl -s -o /dev/null -c "$JAR_B" "$BASE/" || fail "B could not reach $BASE"

# A creates a project.
ID="$(curl -s -X POST "$BASE/api/projects" -b "$JAR_A" -c "$JAR_A" | json_field '.id')"
[ -n "$ID" ] && [ "$ID" != "undefined" ] && [ "$ID" != "PARSE_ERROR" ] || fail "A could not create a project (got '$ID')"
echo "A created project $ID"

# A sees it.
A_SEES="$(curl -s "$BASE/api/projects" -b "$JAR_A" -c "$JAR_A" | json_field ".some(p=>p.id==='$ID')")"
[ "$A_SEES" = "true" ] || fail "A cannot see its own project"

# B must not see it in the list.
B_SEES="$(curl -s "$BASE/api/projects" -b "$JAR_B" -c "$JAR_B" | json_field ".some(p=>p.id==='$ID')")"
[ "$B_SEES" = "false" ] || fail "B can see A's project in the list"

# B must not read, write or delete it.
CODE="$(status GET "$BASE/api/projects/$ID" "$JAR_B")"
[ "$CODE" = "404" ] || fail "B GET returned $CODE, expected 404"

BODY='{"title":"hijacked","waypoints":[{"name":"X","lat":0,"lng":0,"transport":"plane","emoji":"X"}]}'
CODE="$(status PUT "$BASE/api/projects/$ID" "$JAR_B" "$BODY")"
[ "$CODE" = "404" ] || fail "B PUT returned $CODE, expected 404"

CODE="$(status DELETE "$BASE/api/projects/$ID" "$JAR_B")"
[ "$CODE" = "404" ] || fail "B DELETE returned $CODE, expected 404"

# A's project survived B's attempts.
CODE="$(status GET "$BASE/api/projects/$ID" "$JAR_A")"
[ "$CODE" = "200" ] || fail "A GET returned $CODE after B's attempts, expected 200"

# Clean up.
CODE="$(status DELETE "$BASE/api/projects/$ID" "$JAR_A")"
[ "$CODE" = "200" ] || fail "A could not delete its own project (got $CODE)"

echo "PASS: projects are isolated per visitor"
```

- [ ] **Step 2: Make it executable and run it to verify it fails**

```bash
chmod +x scripts/verify-ownership.sh
npm run build && (npm start &) && sleep 5
./scripts/verify-ownership.sh http://localhost:3000
```

Expected: `FAIL: B can see A's project in the list`, exit code 1. That is today's bug, reproduced.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-ownership.sh
git commit -m "Add a failing check for per-visitor project isolation"
```

---

### Task 2: Owner id middleware

**Files:**
- Create: `src/lib/owner.ts`
- Create: `src/lib/owner-server.ts`
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `OWNER_COOKIE: string` (`'sunsky_owner'`) and `OWNER_HEADER: string` (`'x-sunsky-owner'`) from `@/lib/owner`
  - `createOwnerId(): string` from `@/lib/owner` — 64 lowercase hex characters
  - `getOwnerId(): Promise<string | null>` from `@/lib/owner-server` — Task 4 calls this in every route handler

`owner.ts` deliberately imports nothing from Next so the edge middleware bundle stays clean; `getOwnerId` lives in a separate module because `next/headers` is Node-only.

- [ ] **Step 1: Write `src/lib/owner.ts`**

```ts
/** Shared between the edge middleware and the Node route handlers, so this
 *  module must not import anything from Next. */

export const OWNER_COOKIE = 'sunsky_owner';
export const OWNER_HEADER = 'x-sunsky-owner';

/** 256 bits of randomness, hex encoded. The id is the bearer token — it is
 *  never signed, because guessing it is already infeasible. */
export function createOwnerId(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 2: Write `src/lib/owner-server.ts`**

```ts
import { headers } from 'next/headers';
import { OWNER_HEADER } from './owner';

/** The middleware republishes the owner id as a request header, so handlers
 *  read one place whether or not the cookie existed on this request. */
export async function getOwnerId(): Promise<string | null> {
    const requestHeaders = await headers();
    return requestHeaders.get(OWNER_HEADER);
}
```

- [ ] **Step 3: Write `src/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { OWNER_COOKIE, OWNER_HEADER, createOwnerId } from '@/lib/owner';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function middleware(request: NextRequest) {
    const existing = request.cookies.get(OWNER_COOKIE)?.value;
    const ownerId = existing ?? createOwnerId();

    // `set`, never `append`: this overwrites any x-sunsky-owner header the
    // client tried to forge, so the cookie is the only source of identity.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(OWNER_HEADER, ownerId);

    const response = NextResponse.next({ request: { headers: requestHeaders } });

    if (!existing) {
        response.cookies.set(OWNER_COOKIE, ownerId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: ONE_YEAR_SECONDS,
        });
    }

    return response;
}

export const config = {
    // Pages and API routes only — no cookie churn on chunks and images.
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 4: Verify the cookie is issued once and then reused**

```bash
npm run build && (npm start &) && sleep 5
JAR=$(mktemp)
echo "--- first request (expect Set-Cookie) ---"
curl -s -D - -o /dev/null -c "$JAR" http://localhost:3000/ | grep -i 'set-cookie'
echo "--- second request (expect NO Set-Cookie) ---"
curl -s -D - -o /dev/null -b "$JAR" -c "$JAR" http://localhost:3000/ | grep -ci 'set-cookie'
echo "--- stored value (expect 64 hex chars) ---"
grep sunsky_owner "$JAR" | awk '{print $7}' | tr -d '\n' | wc -c
```

Expected: first line shows `sunsky_owner=<64 hex>; Path=/; HttpOnly; SameSite=Lax`; second prints `0`; third prints `64`.

- [ ] **Step 5: Verify a forged header cannot impersonate**

```bash
curl -s -D - -o /dev/null -b "$JAR" -H 'x-sunsky-owner: forged' http://localhost:3000/api/projects | head -1
```

Expected: `200`. The forged value is discarded by the middleware; it must never reach a handler. (Task 4 adds the assertion that it changes nothing.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/owner.ts src/lib/owner-server.ts src/middleware.ts
git commit -m "Issue an anonymous owner id cookie from middleware"
```

---

### Task 3: Add `ownerId` to the schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_project_owner/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `Project.ownerId: string` (required) on the generated Prisma client, plus the `Project_ownerId_updatedAt_idx` index. Task 4 reads and writes this field.

- [ ] **Step 1: Confirm the table holds only the known orphan row**

```bash
npx prisma db execute --stdin <<'SQL'
SELECT id, title, "createdAt" FROM "Project";
SQL
```

Expected: at most one row, titled `New Trip`, created 2026-08-04. **If any unfamiliar row appears, stop and ask** — the migration deletes every row and there is no undo.

- [ ] **Step 2: Edit `prisma/schema.prisma`**

Change the `Project` model to:

```prisma
model Project {
  id        String     @id @default(cuid())
  ownerId   String
  title     String     @default("My Journey")
  waypoints Waypoint[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@index([ownerId, updatedAt])
}
```

Leave the `Waypoint` model untouched.

- [ ] **Step 3: Generate the migration without applying it**

```bash
npx prisma migrate dev --name add_project_owner --create-only
```

- [ ] **Step 4: Hand-edit the generated SQL**

Prisma emits an `ADD COLUMN ... NOT NULL` that fails against existing rows. Replace the whole file with:

```sql
-- The only row is deployment test data, and an anonymous owner cannot be
-- reconstructed for it. Waypoints cascade with their project.
DELETE FROM "Project";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "ownerId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Project_ownerId_updatedAt_idx" ON "Project"("ownerId", "updatedAt");
```

- [ ] **Step 5: Apply it and verify the shape**

```bash
npx prisma migrate deploy
npx prisma db execute --stdin <<'SQL'
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name = 'Project' ORDER BY ordinal_position;
SQL
```

Expected: migration applies cleanly; `ownerId` appears with `is_nullable = NO`.

- [ ] **Step 6: Regenerate the client and typecheck**

```bash
npx prisma generate
npm run typecheck
```

Expected: `typecheck` now FAILS in `src/app/api/projects/route.ts` because `POST` creates a project without `ownerId`. That is the correct signal; Task 4 fixes it.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add a required ownerId to Project"
```

---

### Task 4: Enforce ownership in the API

**Files:**
- Modify: `src/app/api/projects/route.ts`
- Modify: `src/app/api/projects/[id]/route.ts`

**Interfaces:**
- Consumes: `getOwnerId()` from `@/lib/owner-server` (Task 2); `Project.ownerId` (Task 3).
- Produces: no new exports. After this task `scripts/verify-ownership.sh` passes.

- [ ] **Step 1: Rewrite `src/app/api/projects/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOwnerId } from '@/lib/owner-server';

export async function GET() {
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: 'Missing owner' }, { status: 401 });

    try {
        const projects = await prisma.project.findMany({
            where: { ownerId },
            orderBy: { updatedAt: 'desc' },
            select: { id: true, title: true, updatedAt: true }
        });
        return NextResponse.json(projects);
    } catch (error) {
        console.error('API Error in GET /projects:', error);
        return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }
}

export async function POST() {
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: 'Missing owner' }, { status: 401 });

    try {
        const project = await prisma.project.create({
            data: {
                ownerId,
                title: 'New Trip',
                waypoints: {
                    create: [
                        { order: 0, name: 'Seoul', lat: 37.5665, lng: 126.9780, transport: 'plane', emoji: '🇰🇷' },
                        { order: 1, name: 'Tokyo', lat: 35.6762, lng: 139.6503, transport: 'plane', emoji: '🇯🇵' }
                    ]
                }
            }
        });
        return NextResponse.json(project);
    } catch (error) {
        console.error('API Error in POST /projects:', error);
        return NextResponse.json({ error: 'Creation failed' }, { status: 500 });
    }
}
```

- [ ] **Step 2: Add the ownership gate to `src/app/api/projects/[id]/route.ts`**

Add these imports beside the existing ones:

```ts
import { getOwnerId } from '@/lib/owner-server';
```

Add this helper below `parseWaypoints`, leaving `TRANSPORT_MODES`, `ParsedWaypoint` and `parseWaypoints` exactly as they are:

```ts
const NOT_FOUND = NextResponse.json({ error: 'Not found' }, { status: 404 });

/** Resolves the caller's owner id, or null when they may not touch this project.
 *  A project owned by someone else is reported as absent, not forbidden. */
async function authorize(id: string): Promise<string | null> {
    const ownerId = await getOwnerId();
    if (!ownerId) return null;

    const project = await prisma.project.findUnique({
        where: { id },
        select: { ownerId: true },
    });

    return project?.ownerId === ownerId ? ownerId : null;
}
```

Replace the three handler bodies:

```ts
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        if (!(await authorize(id))) return NOT_FOUND;

        const project = await prisma.project.findUnique({
            where: { id },
            include: { waypoints: { orderBy: { order: 'asc' } } }
        });

        if (!project) return NOT_FOUND;
        return NextResponse.json(project);
    } catch (error) {
        console.error('API Error in GET /projects/[id]:', error);
        return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    let body: { title?: unknown; waypoints?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const title = typeof body.title === 'string' && body.title.trim() ? body.title : 'My Journey';
    const waypoints = parseWaypoints(body.waypoints);

    if (!waypoints) {
        return NextResponse.json({ error: 'Invalid waypoints payload' }, { status: 400 });
    }

    try {
        if (!(await authorize(id))) return NOT_FOUND;

        await prisma.$transaction([
            prisma.waypoint.deleteMany({ where: { projectId: id } }),
            prisma.project.update({
                where: { id },
                data: {
                    title,
                    waypoints: {
                        create: waypoints.map((wp, index) => ({ ...wp, order: index }))
                    }
                }
            })
        ]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('API Error in PUT /projects/[id]:', error);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const ownerId = await getOwnerId();
        if (!ownerId) return NOT_FOUND;

        // Scoping the delete to the owner makes the check and the write atomic.
        const { count } = await prisma.project.deleteMany({ where: { id, ownerId } });
        if (count === 0) return NOT_FOUND;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('API Error in DELETE /projects/[id]:', error);
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
}
```

Note the ordering in `PUT`: the payload is validated before `authorize`, so a malformed body from a stranger still gets 400. That is intentional — it leaks nothing about whether the project exists.

- [ ] **Step 3: Run the isolation check and watch it pass**

```bash
npm run build && (npm start &) && sleep 5
./scripts/verify-ownership.sh http://localhost:3000
```

Expected: `PASS: projects are isolated per visitor`, exit code 0.

- [ ] **Step 4: Confirm a forged header still changes nothing**

```bash
JAR=$(mktemp)
curl -s -o /dev/null -c "$JAR" http://localhost:3000/
curl -s -X POST http://localhost:3000/api/projects -b "$JAR" -c "$JAR" > /dev/null
echo "own list:"
curl -s http://localhost:3000/api/projects -b "$JAR" -c "$JAR" | head -c 200; echo
echo "with forged header (must be identical):"
curl -s http://localhost:3000/api/projects -b "$JAR" -c "$JAR" -H 'x-sunsky-owner: forged' | head -c 200; echo
echo "forged header, no cookie (must be []):"
curl -s http://localhost:3000/api/projects -H 'x-sunsky-owner: forged'; echo
```

Expected: the first two lines match; the third prints `[]`.

- [ ] **Step 5: Typecheck, lint, build**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all three clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/projects/route.ts "src/app/api/projects/[id]/route.ts"
git commit -m "Scope every project query to the requesting visitor"
```

---

### Task 5: Produce the landing background assets

**Files:**
- Create: `public/demo-poster.jpg`
- Create: `public/demo.webm` (best effort)
- Create then delete: `src/app/api/dev/capture/route.ts`
- Create then delete: `src/app/dev/capture/page.tsx`

**Interfaces:**
- Consumes: a working Mapbox token in the local environment.
- Produces: `/demo-poster.jpg` and, if capture succeeds, `/demo.webm`. Task 6 references both paths.

The capture route writes to disk, so it must never reach production. It is deleted in Step 7 of this task and its absence is asserted before committing.

- [ ] **Step 1: Pull the Mapbox token into the local environment**

The token was only ever added to the Production environment, and `vercel env pull`
defaults to Development — the environment flag is required or the file comes back without
it.

```bash
mkdir -p public
vercel env pull .env.local --environment=production
grep NEXT_PUBLIC_MAPBOX_TOKEN .env.local | cut -c1-40
```

Expected: a line beginning `NEXT_PUBLIC_MAPBOX_TOKEN="pk.` — not an empty value.
`.env.local` is already gitignored, and Next loads it ahead of `.env`, so the empty
placeholder there is overridden.

`public/` does not exist yet; the capture endpoint writes into it and would fail otherwise.

- [ ] **Step 2: Create the temporary capture endpoint**

`src/app/api/dev/capture/route.ts`:

```ts
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

// Local asset-authoring tool. Deleted before this task is committed.
export async function POST(request: Request) {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not available' }, { status: 404 });
    }

    const name = new URL(request.url).searchParams.get('name');
    if (!name || !/^[a-z0-9-]+\.(jpg|webm)$/.test(name)) {
        return NextResponse.json({ error: 'Bad name' }, { status: 400 });
    }

    const bytes = Buffer.from(await request.arrayBuffer());
    await writeFile(path.join(process.cwd(), 'public', name), bytes);

    return NextResponse.json({ written: name, bytes: bytes.length });
}
```

- [ ] **Step 3: Create the temporary capture page**

`src/app/dev/capture/page.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useEditorStore } from '@/lib/store';
import type { MapCanvasHandle } from '@/components/map/MapCanvas';

const MapCanvas = dynamic(() => import('@/components/map/MapCanvas'), { ssr: false });

const upload = (name: string, blob: Blob) =>
    fetch(`/api/dev/capture?name=${name}`, { method: 'POST', body: blob })
        .then((r) => r.json());

export default function CapturePage() {
    const mapRef = useRef<MapCanvasHandle>(null);
    const [log, setLog] = useState<string[]>([]);
    const say = (m: string) => setLog((l) => [...l, m]);

    useEffect(() => {
        const store = useEditorStore.getState();
        store.setWaypoints([
            { id: 'demo-1', name: 'Incheon', lat: 37.4602, lng: 126.4407, transport: 'plane', emoji: '🇰🇷🛫' },
            { id: 'demo-2', name: 'Paris', lat: 48.8566, lng: 2.3522, transport: 'plane', emoji: '🇫🇷🥖' },
            { id: 'demo-3', name: 'New York', lat: 40.7128, lng: -74.0060, transport: 'plane', emoji: '🇺🇸🏙️' },
            { id: 'demo-4', name: 'Tokyo', lat: 35.6762, lng: 139.6503, transport: 'plane', emoji: '🇯🇵🍣' },
        ]);
        store.setCameraView('follow');
    }, []);

    const run = async () => {
        const stream = mapRef.current?.captureStream();
        if (!stream) return say('no stream — is the map loaded?');

        const canvas = document.querySelector('canvas');
        if (!canvas) return say('no canvas');

        canvas.toBlob(async (b) => {
            if (b) say(JSON.stringify(await upload('demo-poster.jpg', b)));
        }, 'image/jpeg', 0.85);

        const recorder = new MediaRecorder(stream, {
            mimeType: 'video/webm; codecs=vp9',
            videoBitsPerSecond: 4_000_000,
        });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = async () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            say(JSON.stringify(await upload('demo.webm', blob)));
        };

        recorder.start(1000);
        useEditorStore.getState().setPlaying(true);
        say('recording…');
        setTimeout(() => recorder.stop(), 12_000);
    };

    return (
        <div className="h-screen w-full bg-black">
            <div className="h-[80vh]"><MapCanvas mapRef={mapRef} /></div>
            <button onClick={run} className="m-4 px-4 py-2 bg-white text-black rounded font-bold">
                Capture
            </button>
            <pre className="text-xs text-green-400 px-4">{log.join('\n')}</pre>
        </div>
    );
}
```

- [ ] **Step 4: Run the capture**

```bash
npm run build && (npm start &) && sleep 5
```

Open `http://localhost:3000/dev/capture`, wait for the globe to render and fly to the route, then press **Capture**. The log prints one JSON line per asset.

- [ ] **Step 5: Verify the assets**

```bash
ls -lh public/
file public/demo-poster.jpg public/demo.webm
```

Expected: `demo-poster.jpg` is a JPEG of at least 50 KB. `demo.webm` is a WebM of a few MB.

**If the video is missing or unplayable, stop trying and continue without it** — Task 6 renders correctly on the poster alone. Record which outcome happened; it goes in the final report.

- [ ] **Step 6: Check the video is not too heavy to commit**

```bash
du -h public/demo.webm 2>/dev/null || echo "no video — poster only"
```

If it exceeds 8 MB, re-run Step 4 with `videoBitsPerSecond: 2_000_000`, or drop the video and ship the poster.

- [ ] **Step 7: Delete the temporary capture code and prove it is gone**

```bash
rm -rf src/app/api/dev src/app/dev
test ! -e src/app/api/dev -a ! -e src/app/dev && echo "capture code removed"
npm run build
```

Expected: prints `capture code removed`; the build no longer lists `/dev/capture` or `/api/dev/capture` in its route table.

- [ ] **Step 8: Commit**

```bash
git add public
git commit -m "Add pre-rendered landing background assets"
```

---

### Task 6: Replace the landing page's live map

**Files:**
- Modify: `src/app/(marketing)/page.tsx`
- Modify: `src/components/map/MapCanvas.tsx`

**Interfaces:**
- Consumes: `/demo-poster.jpg` and optionally `/demo.webm` (Task 5).
- Produces: no new exports. Removes the `decorative` prop from `MapCanvasProps`.

- [ ] **Step 1: Swap the background element**

In `src/app/(marketing)/page.tsx`, replace:

```tsx
                <MapCanvas decorative />
```

with:

```tsx
                <video
                    className="w-full h-full object-cover"
                    poster="/demo-poster.jpg"
                    autoPlay
                    muted
                    loop
                    playsInline
                    aria-hidden="true"
                >
                    <source src="/demo.webm" type="video/webm" />
                </video>
```

If the video file is missing, the browser falls back to the poster frame, which is why the poster is not optional.

- [ ] **Step 2: Delete the demo animation machinery**

Remove from the same file:

- the `MapCanvas` dynamic import and the `dynamic` import statement
- the `useEditorStore` import
- the entire "Demo Scene Setup" effect (`store.setWaypoints([...])` through `setTimeout(... setPlaying(true), 1500)`)
- the `isPlaying` subscription and the "Auto-Loop (Replay on finish)" effect

Keep `useState`, `useEffect`, `useCallback`, `useRouter`, the icon imports, and everything about project listing and deletion.

- [ ] **Step 3: Drop the now-dead `decorative` prop**

In `src/components/map/MapCanvas.tsx`, change:

```tsx
interface MapCanvasProps {
    // React 19 types make refs nullable, so the handle must be too.
    mapRef?: React.RefObject<MapCanvasHandle | null>;
    /** Background usage: stay silent when the map can't be shown. */
    decorative?: boolean;
}

const MapCanvas: React.FC<MapCanvasProps> = ({ mapRef, decorative = false }) => {
```

to:

```tsx
interface MapCanvasProps {
    // React 19 types make refs nullable, so the handle must be too.
    mapRef?: React.RefObject<MapCanvasHandle | null>;
}

const MapCanvas: React.FC<MapCanvasProps> = ({ mapRef }) => {
```

and remove this line from the missing-token branch:

```tsx
        if (decorative) return <div className="w-full h-full bg-zinc-950" />;
```

The editor is now the only caller, and it always wants the explanatory placeholder.

- [ ] **Step 4: Verify the landing page makes zero Mapbox requests**

```bash
npm run typecheck && npm run lint && npm run build && (npm start &) && sleep 5
```

Load `http://localhost:3000` in a browser, then read the network log. Expected: **zero** requests to `api.mapbox.com` and zero `blob:` worker URLs. Before this task there were several.

Then load `http://localhost:3000/projects/<id>/editor` for a project you own and confirm the map still renders — the editor must be unaffected.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(marketing)/page.tsx" src/components/map/MapCanvas.tsx
git commit -m "Serve the landing background as video instead of a live map"
```

---

### Task 7: Deploy and verify in production

**Files:**
- None modified. This task is verification.

**Interfaces:**
- Consumes: everything above.
- Produces: a green production run of `scripts/verify-ownership.sh`.

- [ ] **Step 1: Push and wait for the deployment**

```bash
git push origin main
until [ "$(vercel ls sunsky-map 2>&1 | grep -c '● Building\|● Queued')" = "0" ]; do sleep 10; done
vercel ls sunsky-map | head -5
```

Expected: the newest production deployment reads `● Ready`.

The `vercel-build` script runs `prisma migrate deploy`, so Task 3's migration applies automatically.

- [ ] **Step 2: Run the isolation check against production**

```bash
./scripts/verify-ownership.sh https://sunsky-map.vercel.app
```

Expected: `PASS: projects are isolated per visitor`.

- [ ] **Step 3: Confirm the landing page bills nothing**

Load `https://sunsky-map.vercel.app` and read the network log. Expected: zero requests to `api.mapbox.com`.

- [ ] **Step 4: Confirm the editor still works end to end**

Create a project through the UI, add a stop, save, reload, and confirm the stop persisted and the map renders.

- [ ] **Step 5: Report the manual step that is still outstanding**

Tell the user, in these terms: the Mapbox token is public by construction, and the only real protection is a URL restriction set at account.mapbox.com → the token → **URL restrictions** → `https://sunsky-map.vercel.app/*`. Nothing in this plan substitutes for it.

Also report whether `public/demo.webm` was produced or the landing page is running on the poster alone.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| `Project.ownerId` + `@@index([ownerId, updatedAt])` | 3 |
| `sunsky_owner` cookie, attributes, unsigned | 2 |
| Middleware matcher excludes `_next` and static | 2 |
| Header republished so the first request works | 2 |
| List filtered by owner | 4 |
| `POST` stamps owner | 4 |
| `GET`/`PUT`/`DELETE` return 404 on mismatch | 4 |
| Orphan row deleted, `ownerId` NOT NULL | 3 |
| Landing map → video + poster | 6 |
| Demo-store side effect removed | 6 |
| Poster guaranteed, video best-effort | 5 |
| Token URL restriction is manual | 7 |
| Verification: two cookie jars | 1, 4, 7 |
| Verification: zero `api.mapbox.com` requests | 6, 7 |
| Verification: build, typecheck, lint | 4, 6 |

No spec requirement is unassigned.

**Placeholder scan:** none — every code step carries the literal content to write, and the one open-ended outcome (video capture succeeding) has a defined fallback and a reporting obligation.

**Type consistency:** `OWNER_COOKIE`, `OWNER_HEADER` and `createOwnerId()` are defined in Task 2 and used with those exact names in Tasks 2 and 4. `getOwnerId(): Promise<string | null>` is defined in Task 2 and awaited in Task 4. `authorize(id): Promise<string | null>` is defined and used only within Task 4. `MapCanvasHandle` and `captureStream()` in Task 5 match the existing export in `src/components/map/MapCanvas.tsx`. `decorative` is introduced in the current codebase and removed in Task 6 along with its only call site.
