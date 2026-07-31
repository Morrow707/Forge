# Forge

Forge is a strength & conditioning coaching platform — a TrainHeroic/TeamBuilder-style
tool for coaches to build an exercise library, program training blocks, and assign them
to athletes, whose calendars stay in sync with what the coach schedules.

## Features

- **Coach & athlete accounts** with role-based dashboards and session auth.
- **Exercise bank** — coaches build a reusable library (category, muscle group,
  equipment, video link, instructions).
- **Program builder** — TrainHeroic-style week/day builder with drag-to-reorder
  exercises, sets/reps/weight/rest/notes per exercise, rest days, and week duplication.
- **Roster & teams** — athletes join a coach via a short coach code; coaches can group
  athletes into teams (TeamBuilder-style) and assign programs to individuals or whole
  teams at once.
- **Synced athlete calendar** — assigning a program with a start date projects every
  program day onto the athlete's calendar at the right date; completing a workout
  reflects back immediately.

## Tech stack

React + Vite + TypeScript on the client, Express + TypeScript on the server, PostgreSQL
via Drizzle ORM, session-based auth with Passport, TanStack Query for data fetching,
Tailwind CSS for styling.

## Design system

The UI theme lives entirely in CSS variables in `client/src/index.css`. The current
palette is a **placeholder** (dark charcoal + bold orange) standing in for the
adapt-ptp.com color scheme until exact brand colors are provided — swap the values
there to re-theme the whole app instantly.

## Getting started

```bash
cp .env.example .env    # then adjust DATABASE_URL if needed
npm install
npm run db:push         # create tables
npm run db:seed         # seed a demo coach + athlete + program
npm run dev             # starts on PORT from .env (default 5000)
```

Demo accounts created by the seed script:

- Coach: `coach@forge.app` / `coach123`
- Athlete: `athlete@forge.app` / `athlete123`

### Scripts

- `npm run dev` — start the dev server (Express + Vite middleware, HMR).
- `npm run build` — build client + server for production.
- `npm start` — run the production build.
- `npm run check` — TypeScript project check.
- `npm run db:push` — push the Drizzle schema to the database.
- `npm run db:seed` — seed demo data.
