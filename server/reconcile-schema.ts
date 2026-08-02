import "dotenv/config";
import { pool } from "./db";

// One-time, fully idempotent schema reconciliation. Every statement here is
// additive-only (CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DROP
// NOT NULL, which is a no-op if already nullable) -- nothing renames, drops,
// or changes the type of anything that already exists. This exists because
// `drizzle-kit push --force` proved unreliable against this project's
// real, organically-evolved production database: its live-diff heuristics
// repeatedly misidentified genuinely new columns/tables as renames of
// unrelated old ones, silently aborting mid-migration in a non-interactive
// build. Since this script never asks Postgres to reconcile two structures
// it can't tell apart, it can't hit that failure mode, regardless of
// exactly what state the database is currently in.
const SQL = `
DO $$ BEGIN
  CREATE TYPE "role" AS ENUM ('coach', 'athlete');
EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'admin';

DO $$ BEGIN
  CREATE TYPE "weight_unit" AS ENUM ('lbs', 'kg');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "weight_mode" AS ENUM ('numeric', 'bodyweight', 'band');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "laterality" AS ENUM ('bilateral', 'unilateral');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "exercise_category" AS ENUM ('strength', 'conditioning', 'olympic', 'accessory', 'mobility', 'plyometric');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "tracking_level" AS ENUM ('none', 'bar_path', 'full');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "health_status" AS ENUM ('healthy', 'hurt');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Owned by connect-pg-simple at runtime; declared here only so it's never
-- mistaken for an "unclaimed" table by anything diffing live schema state.
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
);
-- A table can have at most one primary key regardless of constraint name,
-- so Postgres raises invalid_table_definition (not duplicate_object) if one
-- already exists under a different name -- check directly instead of
-- guessing which exception class applies.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = '"session"'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "name" text NOT NULL,
  "role" role NOT NULL,
  "coach_code" text,
  "preferred_weight_unit" weight_unit NOT NULL DEFAULT 'lbs',
  "age" integer,
  "height_in" integer,
  "body_weight_lbs" real,
  "sport" text,
  "position" text,
  "phone" text,
  "notify_email" boolean NOT NULL DEFAULT true,
  "notify_sms" boolean NOT NULL DEFAULT false,
  "health_status" health_status NOT NULL DEFAULT 'healthy',
  "calendar_token" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferred_weight_unit" weight_unit NOT NULL DEFAULT 'lbs';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "age" integer;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "height_in" integer;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "body_weight_lbs" real;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sport" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "position" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_email" boolean NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_sms" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "health_status" health_status NOT NULL DEFAULT 'healthy';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "calendar_token" text;
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_coach_code_idx" ON "users" ("coach_code");
CREATE UNIQUE INDEX IF NOT EXISTS "users_calendar_token_idx" ON "users" ("calendar_token");

CREATE TABLE IF NOT EXISTS "coach_athletes" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "coach_athlete_pair_idx" ON "coach_athletes" ("coach_id", "athlete_id");

CREATE TABLE IF NOT EXISTS "teams" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "code" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "code" text;
CREATE UNIQUE INDEX IF NOT EXISTS "teams_code_idx" ON "teams" ("code");

CREATE TABLE IF NOT EXISTS "team_members" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "team_member_pair_idx" ON "team_members" ("team_id", "athlete_id");

CREATE TABLE IF NOT EXISTS "exercises" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "category" exercise_category NOT NULL DEFAULT 'strength',
  "muscle_group" text NOT NULL DEFAULT 'Full Body',
  "equipment" text NOT NULL DEFAULT 'Barbell',
  "movement_type" text,
  "laterality" laterality,
  "is_corrective" boolean NOT NULL DEFAULT false,
  "video_url" text,
  "instructions" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "movement_type" text;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "laterality" laterality;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "is_corrective" boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE TYPE "exercise_submission_status" AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "exercise_submissions" (
  "id" serial PRIMARY KEY,
  "exercise_id" integer NOT NULL REFERENCES "exercises"("id") ON DELETE CASCADE,
  "submitted_by" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" exercise_submission_status NOT NULL DEFAULT 'pending',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "resolved_at" timestamp
);

DO $$ BEGIN
  CREATE TYPE "exercise_report_status" AS ENUM ('open', 'resolved');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "exercise_issue_type" AS ENUM ('broken_video', 'wrong_info', 'misspelling', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "exercise_reports" (
  "id" serial PRIMARY KEY,
  "exercise_id" integer NOT NULL REFERENCES "exercises"("id") ON DELETE CASCADE,
  "reported_by" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "issue_type" exercise_issue_type NOT NULL,
  "note" text,
  "status" exercise_report_status NOT NULL DEFAULT 'open',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "resolved_at" timestamp
);

CREATE TABLE IF NOT EXISTS "programs" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "program_weeks" (
  "id" serial PRIMARY KEY,
  "program_id" integer NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "week_number" integer NOT NULL,
  "name" text
);

CREATE TABLE IF NOT EXISTS "program_days" (
  "id" serial PRIMARY KEY,
  "week_id" integer NOT NULL REFERENCES "program_weeks"("id") ON DELETE CASCADE,
  "day_number" integer NOT NULL,
  "title" text NOT NULL DEFAULT 'Training Day',
  "is_rest_day" boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "program_exercises" (
  "id" serial PRIMARY KEY,
  "day_id" integer NOT NULL REFERENCES "program_days"("id") ON DELETE CASCADE,
  "exercise_id" integer NOT NULL REFERENCES "exercises"("id") ON DELETE CASCADE,
  "order_index" integer NOT NULL DEFAULT 0,
  "sets" integer NOT NULL DEFAULT 3,
  "reps" text NOT NULL DEFAULT '10',
  "weight" text,
  "rest_seconds" integer,
  "notes" text,
  "superset_group" text,
  "tracking_level" tracking_level NOT NULL DEFAULT 'none',
  "video_check_enabled" boolean NOT NULL DEFAULT false
);
ALTER TABLE "program_exercises" ADD COLUMN IF NOT EXISTS "superset_group" text;
ALTER TABLE "program_exercises" ADD COLUMN IF NOT EXISTS "tracking_level" tracking_level NOT NULL DEFAULT 'none';
ALTER TABLE "program_exercises" ADD COLUMN IF NOT EXISTS "video_check_enabled" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "assignments" (
  "id" serial PRIMARY KEY,
  "program_id" integer NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "start_date" date NOT NULL,
  "correctives_enabled" boolean NOT NULL DEFAULT true,
  "date_overrides" json,
  "created_at" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "correctives_enabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "date_overrides" json;

CREATE TABLE IF NOT EXISTS "assignment_correctives" (
  "id" serial PRIMARY KEY,
  "assignment_id" integer NOT NULL REFERENCES "assignments"("id") ON DELETE CASCADE,
  "program_day_id" integer NOT NULL REFERENCES "program_days"("id") ON DELETE CASCADE,
  "exercise_id" integer NOT NULL REFERENCES "exercises"("id") ON DELETE CASCADE,
  "order_index" integer NOT NULL DEFAULT 0,
  "sets" integer NOT NULL DEFAULT 3,
  "reps" text NOT NULL DEFAULT '10',
  "weight" text,
  "rest_seconds" integer,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "workout_logs" (
  "id" serial PRIMARY KEY,
  "assignment_id" integer NOT NULL REFERENCES "assignments"("id") ON DELETE CASCADE,
  "program_day_id" integer NOT NULL REFERENCES "program_days"("id") ON DELETE CASCADE,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "completed" boolean NOT NULL DEFAULT false,
  "completed_at" timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS "workout_log_day_instance_idx" ON "workout_logs" ("assignment_id", "program_day_id", "date");

CREATE TABLE IF NOT EXISTS "workout_log_entries" (
  "id" serial PRIMARY KEY,
  "workout_log_id" integer NOT NULL REFERENCES "workout_logs"("id") ON DELETE CASCADE,
  "program_exercise_id" integer REFERENCES "program_exercises"("id") ON DELETE CASCADE,
  "corrective_id" integer REFERENCES "assignment_correctives"("id") ON DELETE CASCADE,
  "weight_mode" weight_mode NOT NULL DEFAULT 'numeric',
  "rpe" integer,
  "notes" text,
  "actual_sets" integer,
  "actual_reps" text,
  "actual_weight" text
);
ALTER TABLE "workout_log_entries" ADD COLUMN IF NOT EXISTS "corrective_id" integer;
ALTER TABLE "workout_log_entries" ADD COLUMN IF NOT EXISTS "weight_mode" weight_mode NOT NULL DEFAULT 'numeric';
ALTER TABLE "workout_log_entries" ADD COLUMN IF NOT EXISTS "actual_sets" integer;
ALTER TABLE "workout_log_entries" ADD COLUMN IF NOT EXISTS "actual_reps" text;
ALTER TABLE "workout_log_entries" ADD COLUMN IF NOT EXISTS "actual_weight" text;
-- Originally required; correctives-only entries now leave this null instead.
ALTER TABLE "workout_log_entries" ALTER COLUMN "program_exercise_id" DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workout_log_entries_corrective_id_assignment_correctives_id_fk'
  ) THEN
    ALTER TABLE "workout_log_entries" ADD CONSTRAINT "workout_log_entries_corrective_id_assignment_correctives_id_fk"
      FOREIGN KEY ("corrective_id") REFERENCES "assignment_correctives"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "workout_set_entries" (
  "id" serial PRIMARY KEY,
  "log_entry_id" integer NOT NULL REFERENCES "workout_log_entries"("id") ON DELETE CASCADE,
  "set_number" integer NOT NULL,
  "reps" text,
  "weight" text,
  "weight_unit_at_log" weight_unit,
  "peak_velocity_mps" real,
  "mean_velocity_mps" real,
  "concentric_seconds" real,
  "eccentric_seconds" real,
  "bar_path_deviation_cm" real,
  "bar_path_trace" json
);
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "weight_unit_at_log" weight_unit;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "peak_velocity_mps" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "mean_velocity_mps" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "concentric_seconds" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "eccentric_seconds" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "bar_path_deviation_cm" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "bar_path_trace" json;

CREATE TABLE IF NOT EXISTS "workout_comments" (
  "id" serial PRIMARY KEY,
  "assignment_id" integer NOT NULL REFERENCES "assignments"("id") ON DELETE CASCADE,
  "program_day_id" integer NOT NULL REFERENCES "program_days"("id") ON DELETE CASCADE,
  "author_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "video_url" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "link" text,
  "read" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "team_posts" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "author_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "team_posts_coach_idx" ON "team_posts" ("coach_id");

CREATE TABLE IF NOT EXISTS "body_metrics" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "weight" real NOT NULL,
  "weight_unit" weight_unit NOT NULL DEFAULT 'lbs',
  "body_fat_percent" real,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "body_metrics_athlete_idx" ON "body_metrics" ("athlete_id");
`;

async function main() {
  console.log("Reconciling schema (idempotent, additive-only)...");
  await pool.query(SQL);
  console.log("Schema reconciliation complete.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
