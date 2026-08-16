import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

/** onClick handler for an <a target="_blank"> anchor. Leaves web behavior
 * completely untouched (the browser already handles target="_blank"
 * correctly) -- only intercepts the click inside the native app, where
 * WKWebView has no useful behavior for target="_blank"/window.open, and
 * routes it through Capacitor's in-app browser sheet instead. */
export function externalLinkClick(url: string) {
  return (e: React.MouseEvent) => {
    if (!Capacitor.isNativePlatform()) return;
    e.preventDefault();
    Browser.open({ url }).catch((err) => console.warn("Failed to open external link", err));
  };
}
