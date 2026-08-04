# Anonymous project ownership and Mapbox cost protection

Date: 2026-08-04
Status: approved, not yet implemented

## Problem

The app is deployed publicly at https://sunsky-map.vercel.app with two open issues.

**Every visitor sees and controls every project.** `GET /api/projects` runs `findMany` with
no filter, and the landing page renders the result as a project list. `GET`, `PUT` and
`DELETE` on `/api/projects/[id]` accept any id from anyone. There is no `auth`, `session`,
`userId` or `ownerId` anywhere in the codebase. A stranger can open the site, read every
trip anyone has made, edit it, or delete it.

**The landing page bills Mapbox on every visit.** It mounts a live `MapCanvas` as a
background and replays the demo animation forever: an effect sets `isPlaying` back to
`true` three seconds after each run finishes. Mapbox charges per map load, so bot traffic
alone accrues cost, and the animation keeps a WebGL context and `requestAnimationFrame`
loop running for as long as the tab is open.

## Scope

This spec covers anonymous, cookie-based ownership and the Mapbox cost work.

Google login is explicitly **out of scope** and gets its own spec. Anonymous ownership
closes the data exposure on its own, and folding OAuth plus account-claiming into the same
change would keep the exposure open for longer. The design below leaves room for that
follow-up: claiming becomes "attach this owner id to a user account".

## Design

### Data model

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

`Waypoint` is unchanged. Waypoints are only ever reached through their project, so they
inherit its ownership.

The index matches the only list query in the app: a user's own projects, newest first.

### Owner identity

`middleware.ts` looks for a `sunsky_owner` cookie on every request. If it is missing, the
middleware mints a 256-bit random id and attaches it to both the outgoing response (so the
browser keeps it) and the request headers (so the route handler serving this same request
can already read it).

Cookie attributes: `httpOnly`, `secure`, `sameSite=lax`, `path=/`, one year max age.

The middleware matcher excludes `/_next/*` and static files, so the cookie is minted on
page and API requests only rather than on every chunk and image fetch.

**The cookie value is not signed.** The id itself is an unguessable bearer token with far
more entropy than an attacker can search, so an HMAC adds no security — it would only add
an `APP_SECRET` environment variable and a verification branch. Someone who sets an
arbitrary cookie value does not gain access to anything; they get their own empty bucket.

### API changes

| Route | Change |
| --- | --- |
| `GET /api/projects` | filter on `where: { ownerId }` |
| `POST /api/projects` | persist `ownerId` on the new project |
| `GET /api/projects/[id]` | 404 unless the project's `ownerId` matches |
| `PUT /api/projects/[id]` | 404 unless the project's `ownerId` matches |
| `DELETE /api/projects/[id]` | 404 unless the project's `ownerId` matches |

Mismatches return **404, not 403**. A 403 would confirm that a project with that id exists,
so 404 hides existence as well as content.

### Existing data

The database was created today and holds one ownerless `New Trip` row left over from
deployment testing. That row is deleted, then `ownerId` is added as `NOT NULL`. No backfill
strategy is needed because there is no real data to preserve.

### Landing page

`MapCanvas` is replaced with `<video autoplay muted loop playsinline poster={...}>`. Map
loads attributable to landing traffic drop to zero, and mobile devices stop paying for a
WebGL context they only ever see behind a dark overlay.

Deleting the demo block also removes a latent bug: the landing page currently writes demo
waypoints into the shared editor store, so navigating landing → editor briefly shows
Incheon/Paris/New York/Tokyo before the real project loads.

### Producing the background asset

Two steps, so the work cannot be blocked on the harder one:

1. **Poster image** — captured from the deployed editor. This alone satisfies the cost
   goal and is guaranteed to be deliverable.
2. **Video** — attempted by pulling the Mapbox token locally with `vercel env pull`,
   running the app, and capturing the canvas to a file through a temporary local route.

If step 2 does not work cleanly it is abandoned and reported, not retried indefinitely. The
markup renders correctly with the poster alone, and a video can be added later by dropping
the file into `public/`.

### What this design cannot do

`NEXT_PUBLIC_MAPBOX_TOKEN` is compiled into the browser bundle by definition. No code
change can hide it. The only real protection is a **URL restriction on the token**, set by
the account owner at account.mapbox.com → the token → URL restrictions →
`https://sunsky-map.vercel.app/*`. Without it, anyone can lift the token from the bundle
and bill this account from their own site. This is a manual step and it matters more than
everything else in this section.

Cookie-scoped ownership also means a user who clears cookies, uses private browsing, or
switches devices loses access to earlier work. That is the accepted cost of zero-friction
entry, and the Google login spec is what resolves it.

## Error handling

- Middleware guarantees the cookie exists, so route handlers treat a missing owner id as a
  server-side invariant violation and return 401 rather than silently creating data.
- Ownership checks read the project first and compare `ownerId`; a missing project and a
  foreign project take the same 404 path.
- The existing payload validation on `PUT` is unchanged.

## Verification

No test framework is introduced. The repository currently has zero tests, and adding a
runner is its own piece of work rather than a rider on a security fix.

Verification is by scripted evidence:

- **Ownership isolation** — a curl script driving two separate cookie jars. It asserts that
  a project created by A is absent from B's list, and that B receives 404 on GET, PUT and
  DELETE against A's project id. The actual output is reported.
- **Zero map loads** — the landing page's network log is checked for requests to
  `api.mapbox.com`. There are such requests today; there must be none afterwards.
- `npm run build`, `npm run typecheck` and `npm run lint` all pass.

## Follow-up work, not in this spec

Recorded from the earlier review of the app, in rough priority order: mobile layout for the
editor panel, accessible names for the icon-only buttons, `error.tsx` / `global-error.tsx`
boundaries, a route cache key that ignores cosmetic waypoint edits, removal of the seven
remaining debug `console.log` calls, completing the Korean translations, non-destructive
project saves, and a test suite.
