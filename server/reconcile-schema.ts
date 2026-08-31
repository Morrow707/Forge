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
// Split into two statements run as two separate pool.query() calls (see
// main() below), not one -- Postgres's simple query protocol treats a
// multi-statement string as a single implicit transaction, and a value
// added by ALTER TYPE ... ADD VALUE can't be read by a later statement in
// that same transaction ("unsafe use of new value" / hint: "New enum
// values must be committed before they can be used"). On a database that's
// already been through an earlier deploy, this never bites -- 'admin' (and
// every other ADD VALUE below) was already committed by a previous,
// separate process run. It DOES bite a genuinely from-scratch database
// (a fresh CI run, a disaster-recovery restore, a brand-new environment),
// which is exactly what surfaced it: SQL_PART_2's movement-screen-battery
// seed reads role = 'admin' in the same breath SQL_PART_1 would have just
// added that value. If a future edit adds another ALTER TYPE ... ADD VALUE
// followed by a same-run read of that value, split it the same way.
const SQL_PART_1 = `
DO $$ BEGIN
  CREATE TYPE "role" AS ENUM ('coach', 'athlete');
EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'guardian';

DO $$ BEGIN
  CREATE TYPE "weight_unit" AS ENUM ('lbs', 'kg');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "weight_mode" AS ENUM ('numeric', 'bodyweight', 'band');
EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "weight_mode" ADD VALUE IF NOT EXISTS 'box';

DO $$ BEGIN
  CREATE TYPE "box_height_unit" AS ENUM ('in', 'm');
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
ALTER TYPE "tracking_level" ADD VALUE IF NOT EXISTS 'jump';
-- 'sprint' and 'mechanics' are Skills' own signals (see the comment on
-- trackingLevelEnum in shared/schema.ts) -- share this enum type as a
-- vocabulary convenience, skill_program_exercises stays a wholly separate
-- table either way.
ALTER TYPE "tracking_level" ADD VALUE IF NOT EXISTS 'sprint';
ALTER TYPE "tracking_level" ADD VALUE IF NOT EXISTS 'mechanics';
-- Rotation-engine modes (hip/shoulder separation, swing tempo, head sway)
-- -- see the comment on trackingLevelEnum in shared/schema.ts.
ALTER TYPE "tracking_level" ADD VALUE IF NOT EXISTS 'golf_swing';
ALTER TYPE "tracking_level" ADD VALUE IF NOT EXISTS 'baseball_swing';
-- Strength-side med ball object tracking -- see the comment on
-- trackingLevelEnum in shared/schema.ts.
ALTER TYPE "tracking_level" ADD VALUE IF NOT EXISTS 'med_ball';
-- Kettlebell swing (arc-pattern) and horizontal load (sled push/loaded
-- carry) tracking -- see the comment on trackingLevelEnum in
-- shared/schema.ts.
ALTER TYPE "tracking_level" ADD VALUE IF NOT EXISTS 'kb_swing';
ALTER TYPE "tracking_level" ADD VALUE IF NOT EXISTS 'horizontal_load';

DO $$ BEGIN
  CREATE TYPE "health_status" AS ENUM ('healthy', 'hurt');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "season_phase" AS ENUM ('off_season', 'pre_season', 'in_season', 'taper');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "goal_type" AS ENUM ('exercise', 'testing');
EXCEPTION WHEN duplicate_object THEN null; END $$;
-- 'skill' targets a best sprint-timing elapsedSeconds off skillSessionLogs
-- (see the comment on goalTypeEnum in shared/schema.ts) -- goals stays a
-- wholly strength-side table otherwise.
ALTER TYPE "goal_type" ADD VALUE IF NOT EXISTS 'skill';

DO $$ BEGIN
  CREATE TYPE "challenge_metric" AS ENUM ('workouts_completed', 'total_reps', 'total_volume');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "cara_activity_type" AS ENUM ('training', 'meeting', 'film_review', 'travel', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "cara_end_reason" AS ENUM ('completed', 'idle_timeout', 'manual_stop');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "trophy_category" AS ENUM ('workout_count', 'streak', 'pr_count');
EXCEPTION WHEN duplicate_object THEN null; END $$;
-- 'speed' counts sprint-timing captures (skillSessionLogs rows with
-- tracking_level 'sprint') -- see the comment on trophyCategoryEnum in
-- shared/schema.ts.
ALTER TYPE "trophy_category" ADD VALUE IF NOT EXISTS 'speed';
-- 'nutrition_streak' counts consecutive calendar days with a food-log
-- entry -- see shared/achievements.ts's NUTRITION_STREAK_TROPHIES comment.
ALTER TYPE "trophy_category" ADD VALUE IF NOT EXISTS 'nutrition_streak';

DO $$ BEGIN
  CREATE TYPE "trophy_tier" AS ENUM ('bronze', 'silver', 'gold');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "chat_role" AS ENUM ('athlete', 'assistant');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "program_chat_role" AS ENUM ('user', 'assistant');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ai_knowledge_chat_role" AS ENUM ('admin', 'assistant');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "form_check_flag" AS ENUM ('best', 'worst');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "food_log_source" AS ENUM ('barcode', 'search', 'manual');
EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "food_log_source" ADD VALUE IF NOT EXISTS 'photo';

DO $$ BEGIN
  CREATE TYPE "periodization_phase" AS ENUM ('accumulation', 'intensification', 'realization', 'deload', 'taper');
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
  "season_phase" season_phase,
  "forty_yard_dash" real,
  "vertical_jump_in" real,
  "broad_jump_in" real,
  "pro_agility_seconds" real,
  "three_cone_seconds" real,
  "bench_max_lbs" real,
  "squat_max_lbs" real,
  "deadlift_max_lbs" real,
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
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "season_phase" season_phase;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "forty_yard_dash" real;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "vertical_jump_in" real;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "broad_jump_in" real;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pro_agility_seconds" real;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "three_cone_seconds" real;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bench_max_lbs" real;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "squat_max_lbs" real;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deadlift_max_lbs" real;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_email" boolean NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_sms" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "health_status" health_status NOT NULL DEFAULT 'healthy';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "calendar_token" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "team_board_read_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cara_weekly_cap_minutes" integer;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "skill_fault_thresholds" json;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_secret" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_backup_code_hashes" json;
-- DEFAULT true here (not false) is deliberate and only affects this ALTER's
-- one-time backfill of EXISTING rows -- every account created before this
-- feature existed becomes retroactively "verified" rather than suddenly
-- getting a verification nag it never had. New signups explicitly insert
-- emailVerified: false (see auth.ts), overriding this column default for
-- every row inserted after.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT true;
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

DO $$ BEGIN
  CREATE TYPE "coach_athlete_request_status" AS ENUM ('pending', 'accepted', 'declined');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "coach_athlete_requests" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" coach_athlete_request_status NOT NULL DEFAULT 'pending',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "responded_at" timestamp
);
CREATE INDEX IF NOT EXISTS "coach_athlete_requests_athlete_idx" ON "coach_athlete_requests" ("athlete_id");

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

CREATE TABLE IF NOT EXISTS "team_challenges" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "metric" challenge_metric NOT NULL,
  "target_value" integer,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "team_challenges_team_idx" ON "team_challenges" ("team_id");

CREATE TABLE IF NOT EXISTS "team_game_days" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "opponent" text,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "team_game_days_team_idx" ON "team_game_days" ("team_id");

CREATE TABLE IF NOT EXISTS "coach_staff" (
  "id" serial PRIMARY KEY,
  "primary_coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "staff_coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "coach_staff_pair_idx" ON "coach_staff" ("primary_coach_id", "staff_coach_id");
CREATE INDEX IF NOT EXISTS "coach_staff_staff_idx" ON "coach_staff" ("staff_coach_id");

CREATE TABLE IF NOT EXISTS "exercises" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "category" exercise_category NOT NULL DEFAULT 'strength',
  "muscle_group" text NOT NULL DEFAULT 'Full Body',
  "equipment" text NOT NULL DEFAULT 'Barbell',
  "movement_type" text,
  "laterality" laterality,
  "body_region" text,
  "plane" text,
  "is_corrective" boolean NOT NULL DEFAULT false,
  "video_eligible" boolean,
  "video_url" text,
  "instructions" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "movement_type" text;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "laterality" laterality;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "body_region" text;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "plane" text;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "movement_complexity" text;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "is_corrective" boolean NOT NULL DEFAULT false;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "video_eligible" boolean;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "uses_weight" boolean NOT NULL DEFAULT true;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "uses_bodyweight" boolean NOT NULL DEFAULT false;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "uses_band" boolean NOT NULL DEFAULT false;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "uses_box" boolean NOT NULL DEFAULT false;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "secondary_muscles" json;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "sports" json;

-- Fully separate from "exercises" -- see the comment on skillExercises in
-- shared/schema.ts for why this isn't just a category on the same table.
CREATE TABLE IF NOT EXISTS "skill_exercises" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "skill_type" text NOT NULL DEFAULT 'Hitting',
  "sports" json,
  "equipment" json,
  "video_url" text,
  "instructions" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "video_eligible" boolean,
  "cross_sport_free" boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS "skill_exercises_coach_idx" ON "skill_exercises" ("coach_id");
ALTER TABLE "skill_exercises" ADD COLUMN IF NOT EXISTS "video_eligible" boolean;
ALTER TABLE "skill_exercises" ADD COLUMN IF NOT EXISTS "cross_sport_free" boolean NOT NULL DEFAULT false;
-- equipment was a free-text "Bat, Balls, Screen" string until the skill
-- picker got a real equipment filter -- converts any row still on the old
-- text column to a real json array (comma-split), guarded by the column's
-- actual current type so this is a no-op once already converted, safe to
-- re-run forever like everything else in this file.
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'skill_exercises' AND column_name = 'equipment') = 'text' THEN
    ALTER TABLE "skill_exercises" ALTER COLUMN "equipment" TYPE json USING (
      CASE WHEN equipment IS NULL OR equipment = '' THEN NULL
      ELSE to_json(string_to_array(equipment, ', ')) END
    );
  END IF;
END $$;

-- Mirrors programs -> program_weeks -> program_days -> program_exercises ->
-- assignments, but referencing skill_exercises and dropping the
-- strength-specific concepts (blocks/phases, supersets, tracking level,
-- video-check, correctives) that don't apply to a skill drill.
CREATE TABLE IF NOT EXISTS "skill_programs" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "skill_program_chat_messages" (
  "id" serial PRIMARY KEY,
  "skill_program_id" integer NOT NULL REFERENCES "skill_programs"("id") ON DELETE CASCADE,
  "author_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" program_chat_role NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "skill_program_chat_messages_program_idx" ON "skill_program_chat_messages" ("skill_program_id", "created_at");

CREATE TABLE IF NOT EXISTS "skill_program_weeks" (
  "id" serial PRIMARY KEY,
  "program_id" integer NOT NULL REFERENCES "skill_programs"("id") ON DELETE CASCADE,
  "week_number" integer NOT NULL,
  "name" text
);
CREATE INDEX IF NOT EXISTS "skill_program_weeks_program_idx" ON "skill_program_weeks" ("program_id");

CREATE TABLE IF NOT EXISTS "skill_program_days" (
  "id" serial PRIMARY KEY,
  "week_id" integer NOT NULL REFERENCES "skill_program_weeks"("id") ON DELETE CASCADE,
  "day_number" integer NOT NULL,
  "title" text NOT NULL DEFAULT 'Skill Session',
  "is_rest_day" boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS "skill_program_days_week_idx" ON "skill_program_days" ("week_id");

CREATE TABLE IF NOT EXISTS "skill_program_exercises" (
  "id" serial PRIMARY KEY,
  "day_id" integer NOT NULL REFERENCES "skill_program_days"("id") ON DELETE CASCADE,
  "skill_exercise_id" integer NOT NULL REFERENCES "skill_exercises"("id") ON DELETE CASCADE,
  "order_index" integer NOT NULL DEFAULT 0,
  "sets" integer NOT NULL DEFAULT 3,
  "reps" text NOT NULL DEFAULT '10',
  "rest_seconds" integer,
  "notes" text,
  "tracking_level" tracking_level NOT NULL DEFAULT 'none'
);
CREATE INDEX IF NOT EXISTS "skill_program_exercises_day_idx" ON "skill_program_exercises" ("day_id");
ALTER TABLE "skill_program_exercises" ADD COLUMN IF NOT EXISTS "tracking_level" tracking_level NOT NULL DEFAULT 'none';

CREATE TABLE IF NOT EXISTS "skill_assignments" (
  "id" serial PRIMARY KEY,
  "skill_program_id" integer NOT NULL REFERENCES "skill_programs"("id") ON DELETE CASCADE,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "start_date" date NOT NULL,
  "duration_weeks" integer NOT NULL DEFAULT 1,
  "date_overrides" json,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "skill_assignments_athlete_idx" ON "skill_assignments" ("athlete_id");
CREATE INDEX IF NOT EXISTS "skill_assignments_coach_idx" ON "skill_assignments" ("coach_id");

CREATE TABLE IF NOT EXISTS "skill_session_logs" (
  "id" serial PRIMARY KEY,
  "skill_assignment_id" integer NOT NULL REFERENCES "skill_assignments"("id") ON DELETE CASCADE,
  "skill_program_day_id" integer NOT NULL REFERENCES "skill_program_days"("id") ON DELETE CASCADE,
  "skill_program_exercise_id" integer NOT NULL REFERENCES "skill_program_exercises"("id") ON DELETE CASCADE,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tracking_level" tracking_level NOT NULL,
  "elapsed_seconds" real,
  "distance_yards" real,
  "preset_id" text,
  "camera_angle" text,
  "faults" json,
  "hip_shoulder_separation_deg" real,
  "weight_transfer_pct" real,
  "hip_rotation_deg" real,
  "arm_slot_deg" real,
  "arm_slot_label" text,
  "well_sequenced" boolean,
  "video_url" text,
  "coach_annotation_url" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "video_favorited" boolean NOT NULL DEFAULT false,
  "pending_deletion_at" date
);
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "video_favorited" boolean NOT NULL DEFAULT false;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "pending_deletion_at" date;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "hip_shoulder_separation_deg" real;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "weight_transfer_pct" real;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "hip_rotation_deg" real;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "video_url" text;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "coach_annotation_url" text;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "arm_slot_deg" real;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "arm_slot_label" text;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "well_sequenced" boolean;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "preset_id" text;
CREATE INDEX IF NOT EXISTS "skill_session_logs_athlete_idx" ON "skill_session_logs" ("athlete_id");
CREATE INDEX IF NOT EXISTS "skill_session_logs_assignment_idx" ON "skill_session_logs" ("skill_assignment_id");

DO $$ BEGIN
  CREATE TYPE "exercise_submission_status" AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "exercise_submissions" (
  "id" serial PRIMARY KEY,
  "exercise_id" integer NOT NULL REFERENCES "exercises"("id") ON DELETE CASCADE,
  "submitted_by" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "coach_count" integer NOT NULL DEFAULT 1,
  "status" exercise_submission_status NOT NULL DEFAULT 'pending',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "resolved_at" timestamp
);
ALTER TABLE "exercise_submissions" ADD COLUMN IF NOT EXISTS "coach_count" integer NOT NULL DEFAULT 1;

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
  "created_at" timestamp NOT NULL DEFAULT now(),
  "ai_authored" boolean NOT NULL DEFAULT false
);
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "ai_authored" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "program_blocks" (
  "id" serial PRIMARY KEY,
  "program_id" integer NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "phase" periodization_phase,
  "order_index" integer NOT NULL DEFAULT 0,
  "notes" text
);
CREATE INDEX IF NOT EXISTS "program_blocks_program_idx" ON "program_blocks" ("program_id");

CREATE TABLE IF NOT EXISTS "program_weeks" (
  "id" serial PRIMARY KEY,
  "program_id" integer NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "week_number" integer NOT NULL,
  "name" text,
  "block_id" integer REFERENCES "program_blocks"("id") ON DELETE SET NULL
);
ALTER TABLE "program_weeks" ADD COLUMN IF NOT EXISTS "block_id" integer REFERENCES "program_blocks"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "program_weeks_block_idx" ON "program_weeks" ("block_id");

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
  "rest_after_group_only" boolean NOT NULL DEFAULT false,
  "tracking_level" tracking_level NOT NULL DEFAULT 'none',
  "video_check_enabled" boolean NOT NULL DEFAULT false
);
ALTER TABLE "program_exercises" ADD COLUMN IF NOT EXISTS "superset_group" text;
ALTER TABLE "program_exercises" ADD COLUMN IF NOT EXISTS "rest_after_group_only" boolean NOT NULL DEFAULT false;
ALTER TABLE "program_exercises" ADD COLUMN IF NOT EXISTS "tracking_level" tracking_level NOT NULL DEFAULT 'none';
ALTER TABLE "program_exercises" ADD COLUMN IF NOT EXISTS "video_check_enabled" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "assignments" (
  "id" serial PRIMARY KEY,
  "program_id" integer NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "start_date" date NOT NULL,
  "correctives_enabled" boolean NOT NULL DEFAULT true,
  "duration_weeks" integer NOT NULL DEFAULT 1,
  "date_overrides" json,
  "created_at" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "correctives_enabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "duration_weeks" integer NOT NULL DEFAULT 1;
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

CREATE TABLE IF NOT EXISTS "assignment_exercise_overrides" (
  "id" serial PRIMARY KEY,
  "assignment_id" integer NOT NULL REFERENCES "assignments"("id") ON DELETE CASCADE,
  "program_day_id" integer NOT NULL REFERENCES "program_days"("id") ON DELETE CASCADE,
  "program_exercise_id" integer NOT NULL REFERENCES "program_exercises"("id") ON DELETE CASCADE,
  "substitute_exercise_id" integer NOT NULL REFERENCES "exercises"("id") ON DELETE CASCADE,
  "reason" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "assignment_exercise_overrides_assignment_day_idx" ON "assignment_exercise_overrides" ("assignment_id", "program_day_id");
CREATE UNIQUE INDEX IF NOT EXISTS "assignment_exercise_overrides_unique_idx" ON "assignment_exercise_overrides" ("assignment_id", "program_day_id", "program_exercise_id");

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
  "program_exercise_id" integer REFERENCES "program_exercises"("id") ON DELETE SET NULL,
  "exercise_id" integer REFERENCES "exercises"("id") ON DELETE SET NULL,
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

-- Bug fix, 2026-08-29: program_exercise_id was ON DELETE CASCADE, and
-- updateProgramDay deletes+reinserts a program day's ENTIRE programExercises
-- row set on every edit, even ones that don't touch a given exercise. That
-- silently cascade-deleted every athlete's already-logged sets for the day
-- -- real weight, tracked velocities, video refs, everything -- the instant
-- a coach edited anything about that day. Switching to SET NULL stops the
-- destructive delete going forward; it cannot undo cascade-deletes that
-- already happened before this migration ran. exercise_id is a permanent,
-- submission-time snapshot of which exercise a set was actually logged
-- against (see submitWorkoutLog), so historical reads no longer depend on
-- programExercises still existing, or still pointing at the same exercise
-- it did at log time. Backfilled below from the live join for every
-- existing row whose program_exercise_id link is still intact; rows
-- already orphaned by a past cascade-delete have no recoverable identity.
ALTER TABLE "workout_log_entries" ADD COLUMN IF NOT EXISTS "exercise_id" integer REFERENCES "exercises"("id") ON DELETE SET NULL;
UPDATE "workout_log_entries" wle
  SET "exercise_id" = pe."exercise_id"
  FROM "program_exercises" pe
  WHERE wle."program_exercise_id" = pe."id" AND wle."exercise_id" IS NULL;
DO $$ BEGIN
  ALTER TABLE "workout_log_entries" DROP CONSTRAINT IF EXISTS "workout_log_entries_program_exercise_id_program_exercises_id_fk";
  ALTER TABLE "workout_log_entries" ADD CONSTRAINT "workout_log_entries_program_exercise_id_program_exercises_id_fk"
    FOREIGN KEY ("program_exercise_id") REFERENCES "program_exercises"("id") ON DELETE SET NULL;
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
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "band_color" text;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "box_height" text;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "box_height_unit" box_height_unit;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "peak_velocity_mps" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "mean_velocity_mps" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "concentric_seconds" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "eccentric_seconds" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "bar_path_deviation_cm" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "bar_path_trace" json;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "form_faults" json;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "rep_breakdown" json;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "arm_path_trace" json;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "peak_power_watts" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "mean_power_watts" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "eccentric_mean_velocity_mps" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "rom_cm" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "velocity_loss_percent" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "form_check_video_url" text;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "form_check_flag" form_check_flag;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "jump_height_cm" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "jump_distance_cm" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "ground_contact_seconds" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "reactive_strength_index" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "jump_breakdown" json;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "leg_drive_asymmetry" json;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "arm_drive_asymmetry" json;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "trust_scores" json;

CREATE TABLE IF NOT EXISTS "workout_comments" (
  "id" serial PRIMARY KEY,
  "assignment_id" integer NOT NULL REFERENCES "assignments"("id") ON DELETE CASCADE,
  "program_day_id" integer NOT NULL REFERENCES "program_days"("id") ON DELETE CASCADE,
  "author_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "video_url" text,
  "image_url" text,
  "date" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "workout_comments" ADD COLUMN IF NOT EXISTS "image_url" text;
ALTER TABLE "workout_comments" ADD COLUMN IF NOT EXISTS "date" text;

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

CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
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

-- Native-app twin of push_subscriptions above (APNs device tokens instead
-- of a Web Push endpoint) -- added to shared/schema.ts when native push
-- shipped, but never added here, so it never existed on the live database
-- at all: every APNs subscribe/lookup hit "relation does not exist"
-- instead of just returning empty. Same missing-reconcile-line class of
-- bug as arm_drive_asymmetry/trust_scores below.
CREATE TABLE IF NOT EXISTS "apns_device_tokens" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "device_token" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "apns_device_tokens_device_token_idx" ON "apns_device_tokens" ("device_token");
CREATE INDEX IF NOT EXISTS "apns_device_tokens_user_idx" ON "apns_device_tokens" ("user_id");

CREATE TABLE IF NOT EXISTS "team_posts" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "author_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "team_posts" ADD COLUMN IF NOT EXISTS "is_announcement" boolean NOT NULL DEFAULT false;
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

CREATE TABLE IF NOT EXISTS "nutrition_targets" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "calories_kcal" integer,
  "protein_g" real,
  "carbs_g" real,
  "fat_g" real,
  "fiber_g" real,
  "water_oz" real,
  "calcium_mg" real,
  "iron_mg" real,
  "vitamin_d_mcg" real,
  "potassium_mg" real,
  "magnesium_mg" real,
  "sodium_mg" real,
  "vitamin_b12_mcg" real,
  "zinc_mg" real,
  "notes" text,
  "updated_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_targets_athlete_idx" ON "nutrition_targets" ("athlete_id");

CREATE TABLE IF NOT EXISTS "food_log_entries" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "description" text NOT NULL,
  "brand" text,
  "serving_description" text,
  "calories_kcal" integer,
  "protein_g" real,
  "carbs_g" real,
  "fat_g" real,
  "fiber_g" real,
  "sodium_mg" real,
  "calcium_mg" real,
  "iron_mg" real,
  "vitamin_d_mcg" real,
  "potassium_mg" real,
  "magnesium_mg" real,
  "vitamin_b12_mcg" real,
  "zinc_mg" real,
  "source" food_log_source NOT NULL,
  "barcode" text,
  "logged_at" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "food_log_entries" ADD COLUMN IF NOT EXISTS "calcium_mg" real;
ALTER TABLE "food_log_entries" ADD COLUMN IF NOT EXISTS "iron_mg" real;
ALTER TABLE "food_log_entries" ADD COLUMN IF NOT EXISTS "vitamin_d_mcg" real;
ALTER TABLE "food_log_entries" ADD COLUMN IF NOT EXISTS "potassium_mg" real;
ALTER TABLE "food_log_entries" ADD COLUMN IF NOT EXISTS "magnesium_mg" real;
ALTER TABLE "food_log_entries" ADD COLUMN IF NOT EXISTS "vitamin_b12_mcg" real;
ALTER TABLE "food_log_entries" ADD COLUMN IF NOT EXISTS "zinc_mg" real;
CREATE INDEX IF NOT EXISTS "food_log_entries_athlete_date_idx" ON "food_log_entries" ("athlete_id", "date");

CREATE TABLE IF NOT EXISTS "testing_results" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "forty_yard_dash" real,
  "vertical_jump_in" real,
  "broad_jump_in" real,
  "pro_agility_seconds" real,
  "three_cone_seconds" real,
  "bench_max_lbs" real,
  "squat_max_lbs" real,
  "deadlift_max_lbs" real,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "testing_results_athlete_idx" ON "testing_results" ("athlete_id");
CREATE UNIQUE INDEX IF NOT EXISTS "testing_results_athlete_date_idx" ON "testing_results" ("athlete_id", "date");
ALTER TABLE "testing_results" ADD COLUMN IF NOT EXISTS "three_cone_seconds" real;

CREATE TABLE IF NOT EXISTS "goniometer_readings" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "recorded_by" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "joint" text NOT NULL,
  "movement" text NOT NULL,
  "angle_degrees" real NOT NULL,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "goniometer_readings_athlete_idx" ON "goniometer_readings" ("athlete_id");
CREATE INDEX IF NOT EXISTS "goniometer_readings_athlete_joint_idx" ON "goniometer_readings" ("athlete_id", "joint");

CREATE TABLE IF NOT EXISTS "weakness_reports" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "generated_by" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "summary" text NOT NULL,
  "deficits" json NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "weakness_reports_athlete_idx" ON "weakness_reports" ("athlete_id");

CREATE TABLE IF NOT EXISTS "goals" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_by" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" goal_type NOT NULL,
  "exercise_id" integer REFERENCES "exercises"("id") ON DELETE CASCADE,
  "testing_metric" text,
  "skill_exercise_id" integer REFERENCES "skill_exercises"("id") ON DELETE CASCADE,
  "target_value" real NOT NULL,
  "target_unit" text NOT NULL,
  "target_date" date,
  "created_at" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "skill_exercise_id" integer REFERENCES "skill_exercises"("id") ON DELETE CASCADE;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "achieved_at" timestamp;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;
CREATE INDEX IF NOT EXISTS "goals_athlete_idx" ON "goals" ("athlete_id");

CREATE TABLE IF NOT EXISTS "wellness_checkins" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "sleep_hours" real NOT NULL,
  "soreness" integer NOT NULL,
  "stress" integer NOT NULL,
  "hydration" integer NOT NULL DEFAULT 3,
  "mental_focus" integer NOT NULL DEFAULT 3,
  "body_pain_map" json NOT NULL DEFAULT '[]',
  "created_at" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "wellness_checkins" ADD COLUMN IF NOT EXISTS "hydration" integer NOT NULL DEFAULT 3;
ALTER TABLE "wellness_checkins" ADD COLUMN IF NOT EXISTS "mental_focus" integer NOT NULL DEFAULT 3;
ALTER TABLE "wellness_checkins" ADD COLUMN IF NOT EXISTS "body_pain_map" json NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS "wellness_checkins_athlete_idx" ON "wellness_checkins" ("athlete_id");
CREATE UNIQUE INDEX IF NOT EXISTS "wellness_checkins_athlete_date_idx" ON "wellness_checkins" ("athlete_id", "date");

CREATE TABLE IF NOT EXISTS "cara_sessions" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "activity_type" cara_activity_type NOT NULL,
  "started_at" timestamp NOT NULL DEFAULT now(),
  "last_activity_at" timestamp NOT NULL DEFAULT now(),
  "ended_at" timestamp,
  "end_reason" cara_end_reason,
  "logged_by_coach_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "note" text
);
CREATE INDEX IF NOT EXISTS "cara_sessions_athlete_idx" ON "cara_sessions" ("athlete_id");
CREATE INDEX IF NOT EXISTS "cara_sessions_open_idx" ON "cara_sessions" ("athlete_id", "ended_at");
-- logged_by_coach_id originally had no ON DELETE behavior at all (the
-- Postgres default, RESTRICT), the only FK in this file that was missing
-- one -- would have blocked deleting a coach's account if they ever
-- manually logged a CARA activity themselves. Re-points an already-live
-- table's constraint at ON DELETE SET NULL to match; a no-op on a fresh
-- database, which already gets it from the CREATE TABLE above.
ALTER TABLE "cara_sessions" DROP CONSTRAINT IF EXISTS "cara_sessions_logged_by_coach_id_fkey";
ALTER TABLE "cara_sessions" ADD CONSTRAINT "cara_sessions_logged_by_coach_id_fkey"
  FOREIGN KEY ("logged_by_coach_id") REFERENCES "users"("id") ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "athlete_trophies" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "category" trophy_category NOT NULL,
  "tier" trophy_tier NOT NULL,
  "label" text NOT NULL,
  "threshold" integer NOT NULL,
  "unlocked_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "athlete_trophies_athlete_idx" ON "athlete_trophies" ("athlete_id");
CREATE UNIQUE INDEX IF NOT EXISTS "athlete_trophies_athlete_key_idx" ON "athlete_trophies" ("athlete_id", "key");

-- ACWR red-zone coach-alert dedup (shared/schema.ts acwrRiskAlerts) -- see
-- that table's own comment.
CREATE TABLE IF NOT EXISTS "acwr_risk_alerts" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "ratio" real NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "acwr_risk_alerts_athlete_date_idx" ON "acwr_risk_alerts" ("athlete_id", "date");

-- Per-athlete goniometer normal-angle override (shared/schema.ts
-- goniometerBaselines) -- see that table's own comment.
CREATE TABLE IF NOT EXISTS "goniometer_baselines" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "joint" text NOT NULL,
  "movement" text NOT NULL,
  "normal_degrees" real NOT NULL,
  "set_by_coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "goniometer_baselines_athlete_joint_movement_idx" ON "goniometer_baselines" ("athlete_id", "joint", "movement");

-- Performance pass -- Postgres never auto-indexes foreign key columns, and
-- these hot-path lookups (workout history, comment threads, notification
-- inbox/unread-count polling, roster/calendar joins) had none.
CREATE INDEX IF NOT EXISTS "program_weeks_program_idx" ON "program_weeks" ("program_id");
CREATE INDEX IF NOT EXISTS "program_days_week_idx" ON "program_days" ("week_id");
CREATE INDEX IF NOT EXISTS "program_exercises_day_idx" ON "program_exercises" ("day_id");
CREATE INDEX IF NOT EXISTS "assignments_athlete_idx" ON "assignments" ("athlete_id");
CREATE INDEX IF NOT EXISTS "assignments_coach_idx" ON "assignments" ("coach_id");
CREATE INDEX IF NOT EXISTS "assignment_correctives_assignment_day_idx" ON "assignment_correctives" ("assignment_id", "program_day_id");
CREATE INDEX IF NOT EXISTS "workout_logs_athlete_date_idx" ON "workout_logs" ("athlete_id", "date");
CREATE INDEX IF NOT EXISTS "workout_comments_assignment_day_idx" ON "workout_comments" ("assignment_id", "program_day_id");
CREATE INDEX IF NOT EXISTS "notifications_user_read_idx" ON "notifications" ("user_id", "read");
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_idx" ON "push_subscriptions" ("user_id");

CREATE TABLE IF NOT EXISTS "readiness_briefings" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "briefing" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "readiness_briefings_athlete_date_idx" ON "readiness_briefings" ("athlete_id", "date");

CREATE TABLE IF NOT EXISTS "athlete_digests" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "week_start" date NOT NULL,
  "digest" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "athlete_digests_athlete_week_idx" ON "athlete_digests" ("athlete_id", "week_start");

CREATE TABLE IF NOT EXISTS "coach_digests" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "week_start" date NOT NULL,
  "digest" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "coach_digests_coach_week_idx" ON "coach_digests" ("coach_id", "week_start");

CREATE TABLE IF NOT EXISTS "athlete_chat_messages" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" chat_role NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "athlete_chat_messages_athlete_idx" ON "athlete_chat_messages" ("athlete_id", "created_at");

CREATE TABLE IF NOT EXISTS "program_chat_messages" (
  "id" serial PRIMARY KEY,
  "program_id" integer NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "author_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" program_chat_role NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "program_chat_messages_program_idx" ON "program_chat_messages" ("program_id", "created_at");

CREATE TABLE IF NOT EXISTS "ai_knowledge_messages" (
  "id" serial PRIMARY KEY,
  "author_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" ai_knowledge_chat_role NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_knowledge_messages_created_idx" ON "ai_knowledge_messages" ("created_at");

-- Singleton row (always id 1) holding the AI's current living programming
-- guidelines, taught by the admin via ai_knowledge_messages above.
CREATE TABLE IF NOT EXISTS "ai_knowledge" (
  "id" integer PRIMARY KEY,
  "guidelines" text NOT NULL DEFAULT '',
  "updated_at" timestamp NOT NULL DEFAULT now()
);
INSERT INTO "ai_knowledge" ("id", "guidelines") VALUES (1, '') ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "nutrition_knowledge_messages" (
  "id" serial PRIMARY KEY,
  "author_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" ai_knowledge_chat_role NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "nutrition_knowledge_messages_created_idx" ON "nutrition_knowledge_messages" ("created_at");

-- Singleton row (always id 1) holding the nutrition AI's current living
-- guidelines, taught by the admin via nutrition_knowledge_messages above.
CREATE TABLE IF NOT EXISTS "nutrition_knowledge" (
  "id" integer PRIMARY KEY,
  "guidelines" text NOT NULL DEFAULT '',
  "updated_at" timestamp NOT NULL DEFAULT now()
);
INSERT INTO "nutrition_knowledge" ("id", "guidelines") VALUES (1, '') ON CONFLICT ("id") DO NOTHING;

DO $$ BEGIN
  CREATE TYPE "gender" AS ENUM ('male', 'female', 'non_binary', 'prefer_not_to_say');
EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" gender;

DO $$ BEGIN
  CREATE TYPE "training_style_preference" AS ENUM ('traditional', 'combination_circuit');
EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "training_style_preference" training_style_preference;

CREATE TABLE IF NOT EXISTS "classes" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "is_forge_official" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "prerequisite_class_id" integer REFERENCES "classes"("id") ON DELETE SET NULL;
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "is_draft" boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE TYPE "class_unlock_rule" AS ENUM ('immediate', 'time_elapsed', 'sessions_logged', 'reps_logged', 'manual');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "class_lessons" (
  "id" serial PRIMARY KEY,
  "class_id" integer NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE,
  "lesson_number" integer NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "skill_program_id" integer NOT NULL REFERENCES "skill_programs"("id") ON DELETE CASCADE,
  "unlock_rule" class_unlock_rule NOT NULL DEFAULT 'immediate',
  "unlock_threshold" integer,
  "price_cents" integer,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "class_lessons_class_idx" ON "class_lessons" ("class_id");
ALTER TABLE "class_lessons" ADD COLUMN IF NOT EXISTS "content" json NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS "class_lesson_quiz_questions" (
  "id" serial PRIMARY KEY,
  "class_lesson_id" integer NOT NULL REFERENCES "class_lessons"("id") ON DELETE CASCADE,
  "order_index" integer NOT NULL DEFAULT 0,
  "question_text" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "class_lesson_quiz_questions_lesson_idx" ON "class_lesson_quiz_questions" ("class_lesson_id");

CREATE TABLE IF NOT EXISTS "class_lesson_quiz_answers" (
  "id" serial PRIMARY KEY,
  "question_id" integer NOT NULL REFERENCES "class_lesson_quiz_questions"("id") ON DELETE CASCADE,
  "order_index" integer NOT NULL DEFAULT 0,
  "answer_text" text NOT NULL,
  "is_correct" boolean NOT NULL DEFAULT false,
  "explanation" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "class_lesson_quiz_answers_question_idx" ON "class_lesson_quiz_answers" ("question_id");

CREATE TABLE IF NOT EXISTS "class_coach_settings" (
  "id" serial PRIMARY KEY,
  "class_id" integer NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "min_sessions_required" integer,
  "min_days_elapsed" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "class_coach_settings_class_coach_idx" ON "class_coach_settings" ("class_id", "coach_id");

CREATE TABLE IF NOT EXISTS "class_enrollments" (
  "id" serial PRIMARY KEY,
  "class_id" integer NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "start_date" date NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "class_enrollments" ADD COLUMN IF NOT EXISTS "completed_at" timestamp;
CREATE INDEX IF NOT EXISTS "class_enrollments_athlete_idx" ON "class_enrollments" ("athlete_id");
CREATE INDEX IF NOT EXISTS "class_enrollments_class_idx" ON "class_enrollments" ("class_id");

CREATE TABLE IF NOT EXISTS "class_lesson_progress" (
  "id" serial PRIMARY KEY,
  "enrollment_id" integer NOT NULL REFERENCES "class_enrollments"("id") ON DELETE CASCADE,
  "class_lesson_id" integer NOT NULL REFERENCES "class_lessons"("id") ON DELETE CASCADE,
  "skill_assignment_id" integer REFERENCES "skill_assignments"("id") ON DELETE SET NULL,
  "unlocked_at" timestamp,
  "purchased_at" timestamp,
  "manually_unlocked" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "class_lesson_progress_enrollment_idx" ON "class_lesson_progress" ("enrollment_id");
ALTER TABLE "class_lesson_progress" ADD COLUMN IF NOT EXISTS "content_completed_at" timestamp;
ALTER TABLE "class_lesson_progress" ADD COLUMN IF NOT EXISTS "quiz_passed_at" timestamp;
ALTER TABLE "class_lesson_progress" ADD COLUMN IF NOT EXISTS "quiz_perfect_at" timestamp;
ALTER TABLE "class_lesson_progress" ADD COLUMN IF NOT EXISTS "quiz_fail_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "class_lesson_progress" ADD COLUMN IF NOT EXISTS "coach_notified_stuck_at" timestamp;

CREATE TABLE IF NOT EXISTS "academy_tracks" (
  "id" serial PRIMARY KEY,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "key_principles_for_ai" text NOT NULL,
  "order_index" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "academy_lessons" (
  "id" serial PRIMARY KEY,
  "track_id" integer NOT NULL REFERENCES "academy_tracks"("id") ON DELETE CASCADE,
  "lesson_number" integer NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "est_minutes" integer,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "academy_lessons_track_idx" ON "academy_lessons" ("track_id");

CREATE TABLE IF NOT EXISTS "academy_lesson_completions" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "lesson_id" integer NOT NULL REFERENCES "academy_lessons"("id") ON DELETE CASCADE,
  "completed_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "academy_lesson_completions_coach_lesson_idx" ON "academy_lesson_completions" ("coach_id", "lesson_id");

CREATE TABLE IF NOT EXISTS "academy_quiz_questions" (
  "id" serial PRIMARY KEY,
  "track_id" integer NOT NULL REFERENCES "academy_tracks"("id") ON DELETE CASCADE,
  "order_index" integer NOT NULL DEFAULT 0,
  "question_text" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "academy_quiz_questions_track_idx" ON "academy_quiz_questions" ("track_id");

CREATE TABLE IF NOT EXISTS "academy_quiz_answers" (
  "id" serial PRIMARY KEY,
  "question_id" integer NOT NULL REFERENCES "academy_quiz_questions"("id") ON DELETE CASCADE,
  "order_index" integer NOT NULL DEFAULT 0,
  "answer_text" text NOT NULL,
  "is_correct" boolean NOT NULL DEFAULT false,
  "explanation" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "academy_quiz_answers_question_idx" ON "academy_quiz_answers" ("question_id");

DO $$ BEGIN
  CREATE TYPE "nutrition_goal" AS ENUM ('build_muscle', 'lose_fat', 'improve_performance', 'general_health');
EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nutrition_goal" nutrition_goal;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nutrition_goal_note" text;

CREATE TABLE IF NOT EXISTS "injury_history" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body_part" text NOT NULL,
  "occurred_on" date NOT NULL,
  "description" text,
  "resolved" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "injury_history_athlete_idx" ON "injury_history" ("athlete_id", "occurred_on");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "agreed_to_terms_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "agreed_to_terms_text" text;

CREATE TABLE IF NOT EXISTS "legal_agreement" (
  "id" integer PRIMARY KEY,
  "content" text NOT NULL DEFAULT '',
  "updated_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "skill_programs" ADD COLUMN IF NOT EXISTS "ai_authored" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "skill_day_logs" (
  "id" serial PRIMARY KEY,
  "skill_assignment_id" integer NOT NULL REFERENCES "skill_assignments"("id") ON DELETE CASCADE,
  "skill_program_day_id" integer NOT NULL REFERENCES "skill_program_days"("id") ON DELETE CASCADE,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "completed" boolean NOT NULL DEFAULT false,
  "completed_at" timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS "skill_day_log_day_instance_idx" ON "skill_day_logs" ("skill_assignment_id", "skill_program_day_id", "date");

CREATE TABLE IF NOT EXISTS "skill_day_comments" (
  "id" serial PRIMARY KEY,
  "skill_assignment_id" integer NOT NULL REFERENCES "skill_assignments"("id") ON DELETE CASCADE,
  "skill_program_day_id" integer NOT NULL REFERENCES "skill_program_days"("id") ON DELETE CASCADE,
  "author_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "video_url" text,
  "image_url" text,
  "date" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "skill_day_comments_assignment_day_idx" ON "skill_day_comments" ("skill_assignment_id", "skill_program_day_id");

ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "peak_wrist_speed_mps" real;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "stride_length_m" real;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "elbow_extension_deg" real;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "release_height_m" real;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "set_point_pause_seconds" real;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "knee_bend_depth_deg" real;

CREATE TABLE IF NOT EXISTS "imported_testing_data" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "imported_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "date" date NOT NULL,
  "exercise_name" text NOT NULL,
  "set_number" integer,
  "load_lbs" real,
  "velocity_mps" real,
  "power_watts" real,
  "source" text NOT NULL DEFAULT 'photo import',
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "imported_testing_data_athlete_idx" ON "imported_testing_data" ("athlete_id", "date");

CREATE TABLE IF NOT EXISTS "provisional_athletes" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "claim_code" text NOT NULL,
  "name" text NOT NULL,
  "height_in" integer,
  "body_weight_lbs" real,
  "age" integer,
  "gender" gender,
  "sport" text,
  "position" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "provisional_athletes_claim_code_idx" ON "provisional_athletes" ("claim_code");
CREATE INDEX IF NOT EXISTS "provisional_athletes_coach_idx" ON "provisional_athletes" ("coach_id");

-- White-label branding + dashboard/nav personalization (org-wide on
-- users, per-team override, per-staff-member display title).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "brand_team_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "brand_logo_url" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "brand_primary_color" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "brand_secondary_color" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hidden_nav_sections" json;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hidden_widgets" json;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "brand_logo_url" text;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "brand_primary_color" text;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "brand_secondary_color" text;
ALTER TABLE "coach_staff" ADD COLUMN IF NOT EXISTS "staff_title" text;

-- Account self-service (name/email/password already had columns/routes;
-- these are the new personalization surface): athlete bio, org
-- motto/mission/contact/welcome text, per-coach personal accent, and
-- primary-coach-only nav label overrides.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "brand_motto" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "brand_mission" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "brand_contact_email" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "brand_welcome_message" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "personal_accent_color" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "personal_secondary_color" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "personal_background_hue" integer;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nav_label_overrides" json;

-- Pricing/billing structure (see shared/billing-tiers.ts, server/billing.ts).
-- is_beta_account defaults true so every existing row stays exempt from
-- enforcement the moment this column exists -- nothing here changes
-- behavior on its own.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_tier" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_add_ons" json;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_beta_account" boolean NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_expires_at" timestamp;

CREATE TABLE IF NOT EXISTS "redeem_codes" (
  "id" serial PRIMARY KEY,
  "code" text NOT NULL,
  "trial_days" integer NOT NULL,
  "max_redemptions" integer,
  "expires_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "redeem_codes_code_idx" ON "redeem_codes" ("code");

CREATE TABLE IF NOT EXISTS "redeem_code_redemptions" (
  "id" serial PRIMARY KEY,
  "code_id" integer NOT NULL REFERENCES "redeem_codes"("id") ON DELETE CASCADE,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "redeemed_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "redeem_code_redemptions_pair_idx" ON "redeem_code_redemptions" ("code_id", "coach_id");

-- Free Agent (individual athlete) AI-coach pricing -- a separate track
-- from the coach/org billing above (see shared/free-agent-tiers.ts).
-- Reuses users.is_beta_account / trial_expires_at as the same two safety
-- switches already in place; nothing here changes behavior on its own.
CREATE TABLE IF NOT EXISTS "family_groups" (
  "id" serial PRIMARY KEY,
  "created_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "free_agent_tier" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "free_agent_add_ons" json;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "family_group_id" integer REFERENCES "family_groups"("id") ON DELETE SET NULL;

-- Form-check video retention (see shared/video-retention.ts). Reuses the
-- same is_beta_account/trial_expires_at switches -- nothing here deletes
-- any video until enforcement is actually on for a given account.
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "video_favorited" boolean NOT NULL DEFAULT false;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "video_uploaded_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "has_video_storage_add_on" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signup_sport" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "unlocked_skill_sports" json;
-- Backfill so a video saved before this column existed doesn't sort as
-- "newest" (NULL sorts last under ASC) and get treated as the last thing
-- retention eviction would ever touch -- one-time, idempotent (only fills
-- rows that are still null; harmless to re-run, there's nothing left to
-- backfill on a second pass).
UPDATE "workout_set_entries" SET "video_uploaded_at" = now()
  WHERE "form_check_video_url" IS NOT NULL AND "video_uploaded_at" IS NULL;

-- Movement profiles (camera-tracker kinematic knowledge) -- same
-- admin-teaching pattern as ai_knowledge/nutrition_knowledge above, but
-- structured tracking thresholds per movement instead of one freeform
-- guidelines document. See shared/schema.ts for the full field rationale.
CREATE TABLE IF NOT EXISTS "movement_knowledge_messages" (
  "id" serial PRIMARY KEY,
  "movement_type" text NOT NULL,
  "author_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" ai_knowledge_chat_role NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "movement_knowledge_messages_type_created_idx" ON "movement_knowledge_messages" ("movement_type", "created_at");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "enabled_features" json;

ALTER TABLE "injury_history" ADD COLUMN IF NOT EXISTS "resolved_on" date;

DO $$ BEGIN
  CREATE TYPE "ai_knowledge_maturity" AS ENUM ('established', 'experimental');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ai_knowledge_source_type" AS ENUM ('chat', 'url', 'image', 'pasted_text');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ai_knowledge_change_type" AS ENUM ('created', 'updated', 'corrected', 'deactivated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Forge AI's central knowledge base -- one row per taught fact/rule,
-- superseding the single-document ai_knowledge/nutrition_knowledge tables
-- above (kept in place, not dropped, until the teaching chat itself is
-- migrated to write here).
CREATE TABLE IF NOT EXISTS "ai_knowledge_entries" (
  "id" serial PRIMARY KEY,
  "content" text NOT NULL,
  "category" text,
  "position" text,
  "gender" gender,
  "age_min" integer,
  "age_max" integer,
  "maturity" ai_knowledge_maturity NOT NULL DEFAULT 'established',
  "source_type" ai_knowledge_source_type NOT NULL DEFAULT 'chat',
  "source_excerpt" text,
  "taught_by" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_knowledge_entries_active_idx" ON "ai_knowledge_entries" ("active");

CREATE TABLE IF NOT EXISTS "ai_knowledge_changelog" (
  "id" serial PRIMARY KEY,
  "entry_id" integer NOT NULL REFERENCES "ai_knowledge_entries"("id") ON DELETE CASCADE,
  "previous_content" text,
  "new_content" text NOT NULL,
  "reason" text NOT NULL,
  "change_type" ai_knowledge_change_type NOT NULL DEFAULT 'updated',
  "changed_by" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_knowledge_changelog_entry_idx" ON "ai_knowledge_changelog" ("entry_id", "created_at");

CREATE TABLE IF NOT EXISTS "aggregate_data_access_log" (
  "id" serial PRIMARY KEY,
  "admin_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "viewed_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "forge_ai_messages" (
  "id" serial PRIMARY KEY,
  "author_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" ai_knowledge_chat_role NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "forge_ai_messages_created_idx" ON "forge_ai_messages" ("created_at");

DO $$ BEGIN
  CREATE TYPE "movement_profile_status" AS ENUM ('active', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "movement_profiles" (
  "id" serial PRIMARY KEY,
  "movement_type" text NOT NULL,
  "status" movement_profile_status NOT NULL DEFAULT 'active',
  "version" integer NOT NULL DEFAULT 1,
  "min_knee_angle_deg" real,
  "valgus_ratio_min" real,
  "max_torso_lean_deg" real,
  "bar_path_deviation_max_cm" real,
  "bar_tilt_max_deg" real,
  "jump_height_outlier_percent" real,
  "camera_framing_notes" text,
  "source_summary" text,
  "created_by" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "movement_profiles_type_status_idx" ON "movement_profiles" ("movement_type", "status");

CREATE TABLE IF NOT EXISTS "ai_knowledge_usage_log" (
  "id" serial PRIMARY KEY,
  "entry_id" integer NOT NULL REFERENCES "ai_knowledge_entries"("id") ON DELETE CASCADE,
  "context" text NOT NULL,
  "called_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_knowledge_usage_log_entry_idx" ON "ai_knowledge_usage_log" ("entry_id", "called_at");

CREATE TABLE IF NOT EXISTS "ai_knowledge_gap_log" (
  "id" serial PRIMARY KEY,
  "context" text NOT NULL,
  "position" text,
  "gender" gender,
  "age" integer,
  "called_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_knowledge_gap_log_context_idx" ON "ai_knowledge_gap_log" ("context", "called_at");

DO $$ BEGIN
  CREATE TYPE "reflection_finding_tier" AS ENUM ('safety', 'informational');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "reflection_confidence" AS ENUM ('low', 'moderate', 'high');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ai_reflection_findings" (
  "id" serial PRIMARY KEY,
  "tier" reflection_finding_tier NOT NULL,
  "category" text NOT NULL,
  "summary" text NOT NULL,
  "detail" text NOT NULL,
  "sample_size" integer NOT NULL,
  "confidence" reflection_confidence NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_reflection_findings_category_idx" ON "ai_reflection_findings" ("category", "created_at");

DO $$ BEGIN
  CREATE TYPE "movement_screen_score_type" AS ENUM ('grade_0_3', 'distance_in', 'time_sec', 'asymmetry_pct');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "movement_screen_capture_method" AS ENUM ('manual', 'photo_import', 'camera_assisted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "body_side" AS ENUM ('left', 'right');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "movement_screen_batteries" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "is_forge_official" boolean NOT NULL DEFAULT false,
  "name" text NOT NULL,
  "description" text,
  "forked_from_id" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "movement_screen_battery_tests" (
  "id" serial PRIMARY KEY,
  "battery_id" integer NOT NULL REFERENCES "movement_screen_batteries"("id") ON DELETE CASCADE,
  "test_key" text NOT NULL,
  "label" text NOT NULL,
  "category" text NOT NULL,
  "score_type" movement_screen_score_type NOT NULL,
  "unit_label" text,
  "side" laterality NOT NULL,
  "instructions" text,
  "sort_order" integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "movement_screen_battery_tests_battery_idx" ON "movement_screen_battery_tests" ("battery_id", "sort_order");
-- category started as an enum before it was loosened to free text so a
-- coach could type their own grouping label instead of picking from a
-- fixed list -- these are no-ops once already migrated, safe to re-run.
ALTER TABLE "movement_screen_battery_tests" ALTER COLUMN "category" TYPE text USING "category"::text;
ALTER TABLE "movement_screen_battery_tests" ADD COLUMN IF NOT EXISTS "unit_label" text;

CREATE TABLE IF NOT EXISTS "movement_screens" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "battery_id" integer REFERENCES "movement_screen_batteries"("id") ON DELETE SET NULL,
  "date" date NOT NULL,
  "capture_method" movement_screen_capture_method NOT NULL DEFAULT 'manual',
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "movement_screens_athlete_idx" ON "movement_screens" ("athlete_id", "date");

CREATE TABLE IF NOT EXISTS "movement_screen_results" (
  "id" serial PRIMARY KEY,
  "screen_id" integer NOT NULL REFERENCES "movement_screens"("id") ON DELETE CASCADE,
  "test_key" text NOT NULL,
  "label" text NOT NULL,
  "category" text NOT NULL,
  "score_type" movement_screen_score_type NOT NULL,
  "unit_label" text,
  "side" body_side,
  "score_value" real NOT NULL,
  "flagged" boolean NOT NULL DEFAULT false,
  "notes" text
);
CREATE INDEX IF NOT EXISTS "movement_screen_results_screen_idx" ON "movement_screen_results" ("screen_id");
ALTER TABLE "movement_screen_results" ALTER COLUMN "category" TYPE text USING "category"::text;
ALTER TABLE "movement_screen_results" ADD COLUMN IF NOT EXISTS "unit_label" text;

`;

// See SQL_PART_1's own comment above for why this is a second, separate
// pool.query() call rather than one continuous string with the block
// above -- this half reads the 'admin' role value SQL_PART_1 just added.
const SQL_PART_2 = `
-- Seeds the Forge-official "Forge Standard Screen" battery once an admin
-- account exists to own it -- a no-op (and safe to re-run every deploy)
-- once it's already been inserted, or if no admin exists yet.
DO $$
DECLARE
  admin_id integer;
  battery_id integer;
BEGIN
  SELECT id INTO admin_id FROM "users" WHERE "role" = 'admin' ORDER BY id LIMIT 1;
  IF admin_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "movement_screen_batteries" WHERE "is_forge_official" = true AND "name" = 'Forge Standard Screen'
  ) THEN
    INSERT INTO "movement_screen_batteries" ("coach_id", "is_forge_official", "name", "description")
    VALUES (admin_id, true, 'Forge Standard Screen', 'Forge''s default functional-movement screen -- postural, mobility, power, and balance tests. Fork it to customize for your team.')
    RETURNING id INTO battery_id;

    INSERT INTO "movement_screen_battery_tests" ("battery_id", "test_key", "label", "category", "score_type", "side", "instructions", "sort_order") VALUES
      (battery_id, 'overhead_squat', 'Overhead Squat', 'postural', 'grade_0_3', 'bilateral', 'Feet shoulder-width, arms overhead, descend as far as comfortable. Watch for heel rise, knee valgus, excessive forward lean, or arms falling forward. 3 = clean depth with no compensation, 2 = one compensation, 1 = multiple compensations, 0 = pain.', 0),
      (battery_id, 'inline_lunge', 'In-Line Lunge', 'postural', 'grade_0_3', 'unilateral', 'Heel-to-toe stance on a line, back knee lowers to touch the floor. Watch for loss of balance, torso lean, or the front knee drifting off the line.', 1),
      (battery_id, 'single_leg_squat', 'Single-Leg Squat', 'postural', 'grade_0_3', 'unilateral', 'Single-leg stance, squat to ~60 degrees of knee flexion. Watch for hip drop, knee valgus, or excessive trunk lean.', 2),
      (battery_id, 'ankle_dorsiflexion', 'Ankle Dorsiflexion (Weight-Bearing Lunge)', 'mobility', 'distance_in', 'unilateral', 'Knee-to-wall lunge test -- record the farthest distance (inches) from the wall the big toe can be while the knee still touches the wall, heel flat.', 3),
      (battery_id, 'shoulder_mobility_reach', 'Shoulder Mobility Reach', 'mobility', 'distance_in', 'unilateral', 'One hand reaches over the shoulder, the other up the back -- record the gap (inches) between fingertips. Smaller is better.', 4),
      (battery_id, 'trunk_stability_pushup', 'Trunk Stability Push-Up', 'power', 'grade_0_3', 'bilateral', 'From a push-up position, the whole body rises as one unit with no lag in the spine. Watch for hips sagging or hiking before the chest clears the floor.', 5),
      (battery_id, 'rotary_stability', 'Rotary Stability', 'power', 'grade_0_3', 'unilateral', 'Quadruped position, opposite hand/knee extend and touch together underneath. Watch for loss of balance or an inability to keep the spine neutral.', 6),
      (battery_id, 'y_balance_anterior', 'Y-Balance -- Anterior Reach', 'balance', 'distance_in', 'unilateral', 'Single-leg stance, reach the free foot as far forward as possible without losing balance or touching down. Record the reach distance in inches.', 7),
      (battery_id, 'y_balance_posteromedial', 'Y-Balance -- Posteromedial Reach', 'balance', 'distance_in', 'unilateral', 'Same setup as the anterior reach, reaching diagonally back and toward the midline.', 8),
      (battery_id, 'y_balance_posterolateral', 'Y-Balance -- Posterolateral Reach', 'balance', 'distance_in', 'unilateral', 'Same setup as the anterior reach, reaching diagonally back and away from the midline.', 9);
  END IF;
END $$;

-- Age-tier scaffolding (see shared/privacy-tiers.ts) -- real date of birth,
-- separate from the self-reported "age" snapshot above, plus provenance/
-- notice flags used by the signup and claim-code routes.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "date_of_birth" date;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "provisioned_via_coach_consent" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "requires_guardian_notice" boolean NOT NULL DEFAULT false;
ALTER TABLE "provisional_athletes" ADD COLUMN IF NOT EXISTS "date_of_birth" date;

-- Admin Query Engine saved filter presets (shared/schema.ts adminSavedViews).
CREATE TABLE IF NOT EXISTS "admin_saved_views" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "filters" json NOT NULL,
  "created_by_admin_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Immutable consent audit log (shared/schema.ts consentRecords).
DO $$ BEGIN
  CREATE TYPE "consent_type" AS ENUM ('terms_of_service', 'biometric_waiver', 'coach_coppa_consent', 'parental_notice_ack');
EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "consent_type" ADD VALUE IF NOT EXISTS 'institutional_agreement';

CREATE TABLE IF NOT EXISTS "consent_records" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "consent_type" consent_type NOT NULL,
  "document_text" text NOT NULL,
  "document_version" text NOT NULL,
  "given_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "consent_records_user_idx" ON "consent_records" ("user_id", "created_at");

-- Immutable per-record access audit log (shared/schema.ts recordAccessAuditLogs).
DO $$ BEGIN
  CREATE TYPE "record_access_action" AS ENUM ('viewed', 'streamed', 'downloaded', 'exported', 'deleted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "record_access_audit_logs" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "target_athlete_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "action_type" record_access_action NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" text,
  "detail" text,
  "justification" text,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "record_access_audit_logs_target_idx" ON "record_access_audit_logs" ("target_athlete_id", "created_at");
CREATE INDEX IF NOT EXISTS "record_access_audit_logs_user_idx" ON "record_access_audit_logs" ("user_id", "created_at");

-- Draft Terms of Service / Privacy Policy documents (shared/schema.ts
-- legalDocuments) -- structure only, content is seeded idempotently by
-- server/seed.ts (onConflictDoNothing), not here, since a multi-paragraph
-- document is much safer to insert via a parameterized Drizzle query than
-- hand-escaped into a raw SQL string literal.
DO $$ BEGIN
  CREATE TYPE "legal_document_type" AS ENUM ('terms_of_service', 'privacy_policy', 'biometric_waiver', 'parental_notice');
EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "legal_document_type" ADD VALUE IF NOT EXISTS 'biometric_waiver';
ALTER TYPE "legal_document_type" ADD VALUE IF NOT EXISTS 'parental_notice';
ALTER TYPE "legal_document_type" ADD VALUE IF NOT EXISTS 'institutional_agreement';

CREATE TABLE IF NOT EXISTS "legal_documents" (
  "id" serial PRIMARY KEY,
  "doc_type" legal_document_type NOT NULL UNIQUE,
  "content" text NOT NULL DEFAULT '',
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Coach-personal widget visibility (shared/schema.ts users.hiddenWidgets).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hidden_widgets" json;

-- Per-staff granular section permissions (shared/coach-sections.ts,
-- shared/schema.ts coachSectionEnum + coachStaff.hiddenSections). Same
-- missing-reconcile-line class of bug as apns_device_tokens above: added to
-- shared/schema.ts but never added here, so the column/type never existed
-- on the live database at all.
DO $$ BEGIN
  CREATE TYPE "coach_section" AS ENUM (
    'calendar', 'programs', 'exercises', 'skillPrograms', 'skillBank',
    'classes', 'roster', 'movementScreens', 'nutrition', 'analytics',
    'leaderboard', 'teamBoard'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TABLE "coach_staff" ADD COLUMN IF NOT EXISTS "hidden_sections" coach_section[] NOT NULL DEFAULT '{}';

-- Coach exercise/skill favoriting (shared/schema.ts favoriteExercises,
-- favoriteSkillExercises).
CREATE TABLE IF NOT EXISTS "favorite_exercises" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "exercise_id" integer NOT NULL REFERENCES "exercises"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "favorite_exercises_pair_idx" ON "favorite_exercises" ("coach_id", "exercise_id");

CREATE TABLE IF NOT EXISTS "favorite_skill_exercises" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "skill_exercise_id" integer NOT NULL REFERENCES "skill_exercises"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "favorite_skill_exercises_pair_idx" ON "favorite_skill_exercises" ("coach_id", "skill_exercise_id");

CREATE TABLE IF NOT EXISTS "exercise_usage_log" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "exercise_id" integer NOT NULL REFERENCES "exercises"("id") ON DELETE CASCADE,
  "last_used_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "exercise_usage_log_pair_idx" ON "exercise_usage_log" ("coach_id", "exercise_id");

CREATE TABLE IF NOT EXISTS "skill_exercise_usage_log" (
  "id" serial PRIMARY KEY,
  "coach_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "skill_exercise_id" integer NOT NULL REFERENCES "skill_exercises"("id") ON DELETE CASCADE,
  "last_used_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "skill_exercise_usage_log_pair_idx" ON "skill_exercise_usage_log" ("coach_id", "skill_exercise_id");

-- Optional wearable-sourced recovery metrics on the daily check-in
-- (shared/schema.ts wellnessCheckins.restingHeartRate/hrv).
ALTER TABLE "wellness_checkins" ADD COLUMN IF NOT EXISTS "resting_heart_rate" real;
ALTER TABLE "wellness_checkins" ADD COLUMN IF NOT EXISTS "hrv" real;

-- Same wearable-sourced, opt-in story, three more Health-derived metrics
-- (shared/schema.ts wellnessCheckins.vo2Max/respiratoryRate/bodyMass).
ALTER TABLE "wellness_checkins" ADD COLUMN IF NOT EXISTS "vo2_max" real;
ALTER TABLE "wellness_checkins" ADD COLUMN IF NOT EXISTS "respiratory_rate" real;
ALTER TABLE "wellness_checkins" ADD COLUMN IF NOT EXISTS "body_mass" real;

-- Heart rate recovery, derived client-side from raw heart-rate samples
-- rather than read directly from Health (shared/schema.ts
-- wellnessCheckins.heartRateRecovery).
ALTER TABLE "wellness_checkins" ADD COLUMN IF NOT EXISTS "heart_rate_recovery" real;

-- PR-badge/Free-Agent rolling-cap purge (shared/schema.ts
-- workoutSetEntries.isPr/pendingDeletionAt -- videoFavorited/video_favorited
-- already added above).
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "is_pr" boolean NOT NULL DEFAULT false;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "pending_deletion_at" date;

-- Golf/baseball swing tracking (shared/schema.ts workoutSetEntries's
-- swingSeparationDeg/swingTempoRatio/swingBackswingMs/swingDownswingMs/
-- swingHeadSwayCm).
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "swing_separation_deg" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "swing_tempo_ratio" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "swing_backswing_ms" integer;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "swing_downswing_ms" integer;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "swing_head_sway_cm" real;
-- Cross-diagonal trust score for swingSeparationDeg (rotation-tracking.ts's summarizeRotation).
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "swing_trust_score" json;

-- Med ball object tracking (shared/schema.ts workoutSetEntries's
-- medBallPeakSpeedMps/medBallReleaseHeightCm).
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "med_ball_peak_speed_mps" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "med_ball_release_height_cm" real;
-- Ball-vs-wrist blend trust score (pose-tracking.ts's blendSpeedEstimates).
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "med_ball_trust_score" json;

-- Kettlebell swing tracking (shared/schema.ts workoutSetEntries's
-- kbSwingPeakSpeedMps/kbSwingPeakHeightCm).
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "kb_swing_peak_speed_mps" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "kb_swing_peak_height_cm" real;
-- Bell-vs-wrist blend trust score (pose-tracking.ts's blendSpeedEstimates).
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "kb_swing_trust_score" json;

-- Horizontal load tracking -- sled push/pull, loaded carry (shared/schema.ts
-- workoutSetEntries's horizontalLoadElapsedSeconds/DistanceYards/AvgSpeedYardsPerSec).
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "horizontal_load_elapsed_seconds" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "horizontal_load_distance_yards" real;
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "horizontal_load_avg_speed_yards_per_sec" real;

-- Billing framework -- see shared/schema.ts's own comment above the
-- subscriptions table for why this exists with nothing wired to real
-- money yet.
DO $$ BEGIN
  CREATE TYPE "subscription_status" AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'hibernating');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_type" text NOT NULL,
  "tier" text NOT NULL,
  "seat_cap" integer,
  "status" subscription_status NOT NULL DEFAULT 'trialing',
  "trial_ends_at" timestamp,
  "current_period_end" timestamp,
  "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "apple_original_transaction_id" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_user_idx" ON "subscriptions" ("user_id");
CREATE INDEX IF NOT EXISTS "subscriptions_stripe_subscription_idx" ON "subscriptions" ("stripe_subscription_id");

CREATE TABLE IF NOT EXISTS "billing_audit_log" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event" text NOT NULL,
  "detail" json,
  "stripe_event_id" text UNIQUE,
  "created_at" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "billing_audit_log" ADD COLUMN IF NOT EXISTS "stripe_event_id" text UNIQUE;
CREATE INDEX IF NOT EXISTS "billing_audit_log_user_idx" ON "billing_audit_log" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "uploaded_files" (
  "id" serial PRIMARY KEY,
  "path" text NOT NULL UNIQUE,
  "uploaded_by" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "uploaded_files_uploaded_by_idx" ON "uploaded_files" ("uploaded_by");

CREATE TABLE IF NOT EXISTS "problem_reports" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "message" text NOT NULL,
  "image_url" text,
  "path" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "problem_reports_created_idx" ON "problem_reports" ("created_at");

DO $$ BEGIN
  CREATE TYPE "session_kind" AS ENUM ('web', 'native');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" session_kind NOT NULL,
  "web_session_id" text,
  "device_label" text,
  "ip_address" text,
  "location" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "last_seen_at" timestamp NOT NULL DEFAULT now(),
  "revoked_at" timestamp
);
CREATE INDEX IF NOT EXISTS "user_sessions_user_idx" ON "user_sessions" ("user_id");

-- One guardian per athlete, ever -- athlete_id is unique (shared/schema.ts
-- guardianLinks' own comment explains why). guardian_id is NOT unique: one
-- guardian account can be linked to multiple athletes.
CREATE TABLE IF NOT EXISTS "guardian_links" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "guardian_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);
-- Pre-existing databases created this as a UNIQUE index (one guardian, one
-- athlete) before multi-child guardian support existed -- drop the
-- uniqueness while keeping the index itself, idempotently.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'guardian_links_guardian_idx' AND i.indisunique
  ) THEN
    DROP INDEX "guardian_links_guardian_idx";
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "guardian_links_guardian_idx" ON "guardian_links" ("guardian_id");

CREATE TABLE IF NOT EXISTS "guardian_invites" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "claimed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "guardian_invites_athlete_idx" ON "guardian_invites" ("athlete_id");

-- Free-text display title for a staff coach (shared/schema.ts
-- coachStaff.staffTitle) -- e.g. "Nutritionist" or "Strength Coach" shown
-- in place of the generic "Coach" label wherever this staff member's name
-- renders, without needing a whole separate account type/role.
ALTER TABLE "coach_staff" ADD COLUMN IF NOT EXISTS "staff_title" text;

-- Per-team branding override (shared/schema.ts teams.brand*) -- optional,
-- falls back to the org-wide users.brand* columns when unset (see
-- getEffectiveBrandingForUser in storage.ts).
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "brand_logo_url" text;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "brand_primary_color" text;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "brand_secondary_color" text;

-- A parent/guardian's request to stop future camera-tracking collection for
-- this athlete (shared/schema.ts users.trackingOptOut) -- see that column's
-- own comment for the full reasoning.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tracking_opt_out" boolean NOT NULL DEFAULT false;

-- A coach's own staff-invite code (shared/schema.ts users.staffInviteCode),
-- separate from coach_code -- see that column's own comment for why joining
-- a coaching staff can no longer reuse the athlete self-signup code.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "staff_invite_code" text;
CREATE UNIQUE INDEX IF NOT EXISTS "users_staff_invite_code_idx" ON "users" ("staff_invite_code");

-- Per-category push opt-out (shared/schema.ts users.pushNotificationCategoryPrefs
-- and shared/notification-categories.ts) -- see that column's own comment.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "push_notification_category_prefs" json;

-- Any coach's own short personal line (shared/schema.ts
-- users.coachingPhilosophy) -- see that column's own comment.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "coaching_philosophy" text;

-- Coach-personal pinned-athletes fast-access list (shared/schema.ts
-- users.pinnedAthleteIds) -- see that column's own comment.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pinned_athlete_ids" json;

-- Coach roster groups (shared/roster-groups.ts, shared/schema.ts
-- users.rosterGroups/coachAthletes.groupId) -- see those columns' own
-- comments for the full writeup.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roster_groups" json;
ALTER TABLE "coach_athletes" ADD COLUMN IF NOT EXISTS "group_id" text;

-- Missing FK indexes found by a 500k-profile stress test: every one of
-- these joins was doing a sequential scan of the whole child table on
-- every request, invisible at dev-seed scale and a 200ms+ full scan once
-- the table hit real production-shaped row counts. See each index's own
-- comment in shared/schema.ts for which read path it backs.
CREATE INDEX IF NOT EXISTS "workout_log_entries_workout_log_id_idx" ON "workout_log_entries" ("workout_log_id");
CREATE INDEX IF NOT EXISTS "workout_set_entries_log_entry_id_idx" ON "workout_set_entries" ("log_entry_id");
CREATE INDEX IF NOT EXISTS "skill_day_logs_athlete_date_idx" ON "skill_day_logs" ("athlete_id", "date");
CREATE INDEX IF NOT EXISTS "teams_coach_idx" ON "teams" ("coach_id");
CREATE INDEX IF NOT EXISTS "coach_athletes_athlete_idx" ON "coach_athletes" ("athlete_id");

-- Partial indexes for the "every video on the platform" admin scan
-- (getAdminVideos) -- only a small fraction of rows in each of these
-- tables has a non-null video column, but without a partial index the
-- WHERE ... IS NOT NULL filter was a full sequential scan every time.
CREATE INDEX IF NOT EXISTS "workout_set_entries_video_idx" ON "workout_set_entries" ("form_check_video_url") WHERE "form_check_video_url" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "skill_session_logs_video_idx" ON "skill_session_logs" ("video_url") WHERE "video_url" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "workout_comments_video_idx" ON "workout_comments" ("video_url") WHERE "video_url" IS NOT NULL;

-- getUsersForAdmin's account search does ilike(name/email, '%term%') --
-- a leading-wildcard pattern that a plain btree index can never serve, so
-- every search was a full sequential scan of the whole users table
-- (~200ms solo at 500k rows, ~5s average under 30 concurrent admin
-- searches). pg_trgm lets a GIN index serve '%term%' ILIKE directly.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "users_name_trgm_idx" ON "users" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);

-- enrollAthleteInClass was a bare check-then-insert with no unique
-- constraint behind it -- two concurrent enroll calls for the same
-- athlete+class could each pass the "not yet enrolled" check and both
-- insert, producing a real duplicate (found via a stress test; fixed in
-- storage.ts with onConflictDoNothing against the new index below). A
-- CREATE UNIQUE INDEX on top of any duplicates already sitting in a real
-- database would just fail the whole reconciliation run, so any duplicate
-- (keeping the earliest enrollment -- the one an athlete's real progress
-- is attached to) is cleared first. classLessonProgress rows on the
-- duplicate cascade-delete with it, so nothing orphaned is left behind.
DELETE FROM "class_enrollments" a USING "class_enrollments" b
WHERE a.class_id = b.class_id AND a.athlete_id = b.athlete_id AND a.id > b.id;
CREATE UNIQUE INDEX IF NOT EXISTS "class_enrollments_class_athlete_idx" ON "class_enrollments" ("class_id", "athlete_id");

-- One row per AI diagnosis run against a native AR tracker's diagLog
-- buffer (see storage.diagnoseTrackerLog) -- makes each on-device "Diagnose
-- with AI" tap a persisted report an admin (or a future Claude session) can
-- come back and read later, not just a one-off readout that's gone once the
-- dialog closes.
CREATE TABLE IF NOT EXISTS "tracker_diagnosis_reports" (
  "id" serial PRIMARY KEY,
  "requested_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "log_text" text NOT NULL,
  "diagnosis" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tracker_diagnosis_reports_created_idx" ON "tracker_diagnosis_reports" ("created_at");

-- Seeds Forge AI's knowledge base (ai_knowledge_entries) with the tracking confidence
-- cross-check system built this session (pose-tracking.ts's blendSpeedEstimates and
-- chainConsistencyPenalty, rotation-tracking.ts's crossDiagonalSpread), so it's available to
-- every AI feature that reads active entries without waiting for an admin to teach it manually
-- through the chat flow -- see aiKnowledgeEntries' own schema comment for why per-entry rows are
-- the central knowledge base every AI feature reads from. taught_by is a real NOT NULL foreign
-- key, so this attributes to whichever admin user actually exists (oldest, for determinism)
-- rather than a fabricated id -- skipped entirely on a database with no admin yet, not inserted
-- with a broken reference. Guarded by the source_excerpt marker so re-running this
-- reconciliation (it runs on every deploy) never inserts a duplicate.
INSERT INTO "ai_knowledge_entries" ("content", "category", "maturity", "source_type", "source_excerpt", "taught_by")
SELECT
  'Forge''s camera tracking cross-checks independent signals against each other to score confidence, rather than trusting any single reading alone. Med-ball throws and kettlebell-swing speed blend the tracked object''s own speed against a body-joint-derived proxy (wrist speed), weighted by each signal''s own confidence -- agreement raises the trust score, disagreement lowers it and the reading gets flagged. Golf/baseball swing separation (X-Factor) is cross-checked against a geometrically independent cross-diagonal distance measurement between the opposite shoulder and hip. Bar-path/full lifts additionally cross-check hip-knee-ankle (for a squat/hinge/lunge) or shoulder-elbow-wrist (for a press/pull) joint consistency within each rep -- a joint moving far less than its neighbors in the same kinetic chain during the same rep is a tracking-glitch signal even when that joint''s own raw confidence score looks fine, since a misdetected landmark can still report high confidence while tracking the wrong feature. When discussing a set''s trust score, or why a tracked reading might be uncertain, reference this cross-check system rather than treating a single confidence number as unexplainable.',
  'tracking',
  'established',
  'pasted_text',
  'Session note: tracking confidence cross-check system (blendSpeedEstimates, chainConsistencyPenalty, crossDiagonalSpread) -- see pose-tracking.ts, rotation-tracking.ts, bar-tracking.ts',
  (SELECT id FROM "users" WHERE role = 'admin' ORDER BY id ASC LIMIT 1)
WHERE
  EXISTS (SELECT 1 FROM "users" WHERE role = 'admin')
  AND NOT EXISTS (
    SELECT 1 FROM "ai_knowledge_entries"
    WHERE "source_excerpt" = 'Session note: tracking confidence cross-check system (blendSpeedEstimates, chainConsistencyPenalty, crossDiagonalSpread) -- see pose-tracking.ts, rotation-tracking.ts, bar-tracking.ts'
  );

-- Backfill height_in/body_weight_lbs for any athlete missing them -- calibrateFromFrames hard-
-- requires a real height (see its own comment in pose-tracking.ts), so a test athlete with none
-- set can never get a single calibrated number out of any camera mode, the exact failure just
-- hit in testing. Only fills genuine NULLs (COALESCE), never overwrites a value someone already
-- set -- explicitly excludes any account matching "jordan" by name (case-insensitive), which
-- already has a real, deliberately-set 6'3"/75in height from testing that must stay untouched.
-- Values are a plausible-but-arbitrary spread (id-derived, so not every row gets the same
-- number) across a normal adult range -- test data for "the camera can run," not measurements of
-- a real person, and weight genuinely doesn't matter for any tracked metric today.
UPDATE "users"
SET
  height_in = COALESCE(height_in, 62 + (id % 16)),
  body_weight_lbs = COALESCE(body_weight_lbs, 140 + (id % 90))
WHERE
  role = 'athlete'
  AND name NOT ILIKE '%jordan%'
  AND (height_in IS NULL OR body_weight_lbs IS NULL);

-- Session-level camera/AI context for a tracked recording (device, lens, format, AF/AE
-- stability) -- see captureDeviceInfoSchema's own comment in shared/schema.ts.
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "capture_device_info" json;

-- The tracking-report bot account (and the .github/workflows/tracking-report.yml that used
-- it) has been removed -- it was a full-admin login whose credential lived in this public
-- repo, and the workflow printed real athlete tracking data straight into this public repo's
-- Actions log. Delete it wherever it was already created (e.g. production, from an earlier
-- deploy) rather than just stopping future creation, since a stale row is still a live
-- full-admin account.
DELETE FROM "users" WHERE "email" = 'claude-report-bot@forge.app';

-- Golf Swing/Hitting/Pitching sport-specialist AI coach chats -- one table for all three
-- add-ons, keyed by add_on (see shared/free-agent-tiers.ts's FreeAgentAddOnId), same shape
-- as athlete_chat_messages above since it's the same reuses-of-chat_role pattern.
CREATE TABLE IF NOT EXISTS "sport_coach_messages" (
  "id" serial PRIMARY KEY,
  "athlete_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "add_on" text NOT NULL,
  "role" chat_role NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "sport_coach_messages_athlete_addon_idx" ON "sport_coach_messages" ("athlete_id", "add_on", "created_at");

-- Admin-editable price overrides for the Billing page's pricing catalog -- see
-- pricing-catalog.ts and storage.getPricingCatalog/setPricingOverride. Empty on a fresh
-- database; every price simply falls back to its coded default until an admin actually edits one.
CREATE TABLE IF NOT EXISTS "pricing_overrides" (
  "key" text PRIMARY KEY,
  "price_cents" integer NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- storage.sweepStaleAccountVideos' own grace-window clock, deliberately separate from
-- pending_deletion_at (shared/schema.ts workoutSetEntries/skillSessionLogs.
-- staleAccountPendingDeletionAt -- see that column's own comment for why it can't share the
-- existing one).
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "stale_account_pending_deletion_at" date;
ALTER TABLE "skill_session_logs" ADD COLUMN IF NOT EXISTS "stale_account_pending_deletion_at" date;

-- Pipeline-stage diagnostics for a tracked recording (calibration method, body-pose/object-
-- detection frame stats, and why an empty set came back empty) -- see
-- trackingDiagnosticsSchema's own comment in shared/schema.ts.
ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "tracking_diagnostics" json;
`;

async function main() {
  console.log("Reconciling schema (idempotent, additive-only)...");
  // Two separate calls, two separate implicit transactions -- see
  // SQL_PART_1's own comment for why that matters on a from-scratch
  // database.
  await pool.query(SQL_PART_1);
  await pool.query(SQL_PART_2);
  console.log("Schema reconciliation complete.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
