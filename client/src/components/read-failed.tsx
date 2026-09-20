import { Button } from "@/components/ui/button";
import { RATE_LIMITED_MESSAGE, isRateLimited } from "@/lib/rate-limit-message";

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
  /** The read's error, when the caller has it. Only a 429 changes what is said. */
  error?: unknown;
}) {
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
