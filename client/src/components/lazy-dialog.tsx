import { lazy, Suspense, useRef, type ComponentProps, type ComponentType } from "react";
import { withLoadTimeout } from "@/lib/lazy-load-recovery";

/** A dialog whose module is not downloaded until the first time it is opened.
 *
 * The workout page used to import all eleven tracker dialogs statically -- and with them
 * MediaPipe's loader, onnxruntime-web and every tracking module -- so the page an athlete opens
 * to log a set paid for the camera pipeline whether or not a camera was ever pointed at
 * anything. AppShell did the same with thirteen settings dialogs that most sessions never open.
 *
 * The contract is deliberately narrow so the dialog itself does not change:
 *
 * - Before the first `open`, nothing is rendered. A closed Radix dialog renders nothing visible
 *   either, so the only difference is that the component's own hooks do not run yet. Every
 *   dialog wrapped this way gates its queries on `open` already, so nothing is fetched later
 *   than it used to be.
 * - From the first `open` onwards the dialog stays MOUNTED across close and reopen, exactly as
 *   the static import did. That matters for the tracker dialogs, whose save path continues
 *   after they call onOpenChange(false); unmounting them on close would be a behaviour change
 *   this helper exists to avoid.
 * - A chunk that fails to load goes through withLoadTimeout, the same recovery a lazy page
 *   gets (see lib/lazy-load-recovery).
 *
 * `preload()` fetches the module without rendering anything, for a page that knows a dialog is
 * likely (the workout page calls it once camera access is confirmed) so the first tap does not
 * wait on a download.
 */
export type LazyDialogComponent<P> = ComponentType<P> & { preload: () => Promise<unknown> };

export function lazyDialog<C extends ComponentType<any>>(
  loader: () => Promise<{ default: C }>,
): LazyDialogComponent<ComponentProps<C> & { open: boolean }> {
  type P = ComponentProps<C> & { open: boolean };
  const Inner = lazy(withLoadTimeout(loader)) as unknown as ComponentType<P>;
  function LazyDialog(props: P) {
    const opened = useRef(props.open);
    if (props.open) opened.current = true;
    if (!opened.current) return null;
    return (
      <Suspense fallback={null}>
        <Inner {...props} />
      </Suspense>
    );
  }
  LazyDialog.preload = loader;
  return LazyDialog as LazyDialogComponent<P>;
}

/** Run a preload when the browser is idle, so it never competes with the page's own paint. */
export function preloadWhenIdle(loaders: Array<{ preload: () => Promise<unknown> }>): () => void {
  const run = () => {
    for (const l of loaders) void l.preload().catch(() => {});
  };
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(run, 1500);
  return () => clearTimeout(id);
}
