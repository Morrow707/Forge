import * as Sentry from "@sentry/node";
import { recordSystemFailure } from "./system-events";

// Scheduled jobs run with nobody watching, which is the whole point of
// scheduling them and also why their failures were invisible: every catch
// block in the three job files wrote to stderr and stopped there. Sentry was
// already wired up for request-path errors, so a 500 someone triggered by
// tapping a button raised an alert while the nightly purge of a minor's
// footage could fail every night for a month in silence -- the opposite of
// the right way round, since one of those has a policy commitment behind it
// and no user to notice it went wrong.
//
// Still logs to stderr as well. The log line is what someone reads while
// debugging with the stream open; the Sentry event is what reaches them when
// nobody is looking. Capture calls are safe to make with no SENTRY_DSN set
// (the SDK no-ops), so this needs no environment check of its own.
export function reportJobFailure(jobName: string, err: unknown, context?: Record<string, unknown>) {
  console.error(`${jobName} failed:`, err, context ?? "");
  // Third destination, added after the same reasoning as Sentry itself went
  // one step further: the alert only helps if SENTRY_DSN was configured.
  // This one shows up on the admin dashboard with no setup at all.
  recordSystemFailure("job", `${jobName} failed`, { detail: err });
  Sentry.captureException(err, {
    tags: { job: jobName },
    ...(context ? { extra: context } : {}),
  });
}
