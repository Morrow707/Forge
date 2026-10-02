import { Capacitor } from "@capacitor/core";

/** LARGER TEXT: the app follows the phone's text size setting.
 *
 * A web view ignores iOS Dynamic Type unless the page opts in, and the usual opt-in
 * (`html { font: -apple-system-body }`) also moves the default from 16px to 17px, which would
 * shift every screen a little for everybody. So instead: measure what the system body size is
 * right now, work out how far it is from its default, and scale the root font by that ratio.
 * At the default setting the ratio is 1 and nothing changes; at the largest accessibility
 * sizes the app's rem-based layout grows with it. Re-measured when the app comes back to the
 * foreground, which is when a changed setting takes effect.
 *
 * Web and Android are left alone: the browser's own text zoom already does this. */
const SYSTEM_BODY_DEFAULT_PX = 17;

function measureSystemBodyPx(): number | null {
  if (typeof document === "undefined") return null;
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;visibility:hidden;font:-apple-system-body;";
  probe.textContent = "x";
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  return Number.isFinite(px) && px > 0 ? px : null;
}

export function dynamicTypeScale(systemBodyPx: number | null): number {
  if (!systemBodyPx) return 1;
  // Clamped so a probe that read something odd cannot shrink or explode the layout.
  return Math.min(3, Math.max(1, systemBodyPx / SYSTEM_BODY_DEFAULT_PX));
}

export function applyDynamicType(): void {
  const scale = dynamicTypeScale(measureSystemBodyPx());
  document.documentElement.style.fontSize = scale === 1 ? "" : `${(scale * 100).toFixed(1)}%`;
}

export function startDynamicType(): void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;
  applyDynamicType();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") applyDynamicType();
  });
}
