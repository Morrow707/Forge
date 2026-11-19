import { useEffect, type CSSProperties } from "react";

/** Copies a brand's CSS variables onto <html> while the page is mounted, so dialogs, menus and
 *  toasts (drawn in a portal on <body>) wear the program's colors too, and takes them off again
 *  when it leaves. */
export function useBrandVarsOnRoot(style: CSSProperties | null | undefined): void {
  const key = JSON.stringify(style ?? {});
  useEffect(() => {
    const vars = (style ?? {}) as Record<string, string>;
    const root = document.documentElement;
    const names = Object.keys(vars).filter((name) => name.startsWith("--"));
    names.forEach((name) => root.style.setProperty(name, String(vars[name])));
    return () => names.forEach((name) => root.style.removeProperty(name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
