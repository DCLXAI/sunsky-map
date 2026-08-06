# Sunsky.ai — Cinematic Travel Route Animations

Turn a list of places into a cinematic 3D map animation and export it as video.

Built with Next.js 16 (App Router), React 19, Mapbox GL, Prisma 7 + Postgres, and Gemini for
natural-language route generation.

## Features

- **3D globe route animation** — great-circle flight paths for air legs, real Mapbox Directions
  geometry for car/train/walk legs, with a follow / top / side / world camera.
- **AI route assistant** — describe a trip in plain language and Gemini returns structured waypoints.
- **Drag-and-drop editor** — reorder stops, set per-leg transport, pick an emoji per stop.
- **Video export** — records the map canvas via `MediaRecorder` (MP4 where supported, WebM otherwise).
- **EN / KO** interface.

## Requirements

- Node.js 20.9 or newer
- A Postgres database (Neon, Supabase, or any Postgres)
- A Mapbox access token
- A Google Gemini API key

## Getting started

```bash
npm install
cp .env.example .env   # then fill in the three values
npx prisma migrate deploy
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. Used by the Prisma driver adapter and by `prisma migrate`. |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | yes | Map rendering, geocoding search, and the Directions API. Exposed to the browser. |
| `GEMINI_API_KEY` | no | Enables the AI route assistant. Without it `/api/ai/generate` returns 500. |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (flat config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Push the Prisma schema without a migration |

## Project layout

```
prisma/
  schema.prisma        Project + Waypoint models
  migrations/          SQL migrations applied with `prisma migrate deploy`
prisma.config.ts       Prisma 7 config (schema path, migrations path, migrate datasource)
src/
  app/
    (marketing)/       Landing page with a live map background looping the demo route
    projects/[projectId]/editor/  The editor
    api/projects/      CRUD for projects and their waypoints
    api/ai/generate/   Gemini route generation
  components/
    map/MapCanvas.tsx  Mapbox globe, layers, and the animation loop
    editor/            Floating panel and sidebar
  lib/
    prisma.ts          Prisma client (pg driver adapter)
    map-utils.ts       Route geometry: great circles, Directions API, dateline unwrap
    store.ts           Zustand editor store
    i18n.ts            EN/KO strings
```

## Notes on the database layer

Prisma 7 no longer reads the connection URL from `schema.prisma`. The URL is supplied in two places:

- `prisma.config.ts` — for CLI commands (`migrate`, `db push`)
- `src/lib/prisma.ts` — passed to `PrismaClient` through `@prisma/adapter-pg`

## Deploying to Vercel

The `vercel-build` script runs `prisma generate && prisma migrate deploy && next build`, so migrations
are applied on every deployment. Set `DATABASE_URL`, `NEXT_PUBLIC_MAPBOX_TOKEN`, and `GEMINI_API_KEY`
in the project's environment variables.
