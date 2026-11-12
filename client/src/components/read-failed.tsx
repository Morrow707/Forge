import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/queryClient";
import { RATE_LIMITED_MESSAGE, isRateLimited } from "@/lib/rate-limit-message";

/* A REFUSAL IS NOT A FAILED READ (2026-11-12). The 500,000-account scale test opened every page
 * as every kind of account, and "We couldn't load ... That isn't the same as there being none"
 * came up on screens whose real answer was permanent: somebody else's athlete, a certificate for
 * a class not finished yet, a workout that is not theirs. "Try again" is wrong advice for all of
 * them. So when the caller passes the read's error, a 403, 404, 409 or 410 says what the server
 * said -- its sentence when it sent one, a plain default when it sent only a status word -- and
 * draws no retry. A dropped connection or a 500 reads exactly as before. */
const PERMANENT_STATUSES = new Set([403, 404, 409, 410]);
const BARE_STATUS_WORDS = new Set(["not found", "forbidden", "conflict", "gone", "unauthorized"]);
const DEFAULT_FOR_STATUS: Record<number, string> = {
  403: "This isn't available to your account.",
  404: "This doesn't exist, or it isn't yours to see.",
  409: "This isn't ready yet.",
  410: "This is no longer available.",
};

/** The sentence for a permanent refusal, or null when the error is not one. */
export function refusalSentence(error: unknown): string | null {
  if (!(error instanceof ApiError) || !PERMANENT_STATUSES.has(error.status)) return null;
  const said = error.message.trim();
  // The server's own words, unless they are only the status word ("Not found.").
  // https://regex101.com/?regex=%5B.!%5D%2B%24&testString=Not%20found.
  const bare = BARE_STATUS_WORDS.has(said.toLowerCase().replace(/[.!]+$/, ""));
  return said && !bare ? said : DEFAULT_FOR_STATUS[error.status];
}

/** "We couldn't load this" — said out loud, instead of rendering as "there is nothing here".
 *
 * THE BUG THIS EXISTS FOR. Almost every read in this app is written as
 * `const { data = [], isLoading } = useQuery(...)`, and then `isLoading ? <spinner> :
 * data.length === 0 ? <"nothing logged"> : <list>`. On a failed request react-query leaves
 * `data` undefined, the `= []` default turns that into an empty array, isLoading goes false --
 * and the screen states, as fact, that the athlete has no injuries, no movement screens, no
 * training load. A sweep found 82 files with a read and no error branch anywhere.
 *
 * It is not a cosmetic gap on the surfaces that carry it. A coach reading "Nothing logged" under
 * an injury history is being told something about a person's body that nobody checked, and the
 * next thing they do is program a session on it.
 *
 * So: one component, said the same way everywhere, with the sentence that actually matters --
 * that this is not the same as nothing being there -- and a retry, because the alternative is
 * asking somebody to reload an app to find out whether a record exists.
 *
 * `error` is OPTIONAL and additive: pass the query's error and a 429 from the rate limiter says
 * so instead of implying a connection fault, which is the one failure here where "try again" is
 * actively the wrong instruction. Every existing call site that passes nothing reads exactly as
 * it did before.
 */
export function ReadFailed({
  what,
  onRetry,
  className,
  error,
}: {
  /** What failed to load, as a noun phrase: "this athlete's injury history". */
  what: string;
  onRetry: () => void;
  className?: string;
  /** The read's error, when the caller has it. A 429 or a permanent refusal changes what is said. */
  error?: unknown;
}) {
  const refusal = refusalSentence(error);
  if (refusal) {
    return (
      <div className={className ?? "flex flex-col items-center gap-2 py-6 text-center"}>
        <p className="text-sm text-muted-foreground" data-testid="text-read-refused">
          {refusal}
        </p>
      </div>
    );
  }
  return (
    <div className={className ?? "flex flex-col items-center gap-2 py-6 text-center"}>
      <p className="text-sm text-muted-foreground">
        {isRateLimited(error)
          ? RATE_LIMITED_MESSAGE
          : `We couldn't load ${what}. That isn't the same as there being none.`}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
