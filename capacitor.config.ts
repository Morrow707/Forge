import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.foreperformancesystems.forge",
  appName: "Forge",
  webDir: "dist/public",
  // Local dev convenience: point the native shell at the Vite dev server
  // instead of the bundled webDir by setting CAP_SERVER_URL before `cap run`
  // (e.g. CAP_SERVER_URL=http://192.168.1.20:5173). Unset in every built
  // artifact -- CI never sets this, so release builds always load the
  // bundled dist/public, never a live dev server.
  ...(process.env.CAP_SERVER_URL
    ? { server: { url: process.env.CAP_SERVER_URL, cleartext: true } }
    : {}),
  ios: {
    // "never" leaves WKWebView's scroll view with no automatic top content
    // inset of its own -- app-shell.tsx/login.tsx/signup.tsx already push
    // themselves down by env(safe-area-inset-top) in CSS, so "automatic"
    // (UIKit's own inset-for-the-safe-area behavior) was stacking a SECOND,
    // redundant gap on top of that one: a large empty band above the header
    // that was really the same safe area being accounted for twice.
    contentInset: "never",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    Badge: {
      // The badge exists to say "you have unread things" -- once the
      // athlete/coach has actually opened the app, that's no longer
      // true, so it should always reset on resume rather than linger
      // until the next unrelated push happens to overwrite it.
      autoClear: true,
    },
    Keyboard: {
      // "native" lets iOS handle it the way every native app does (the
      // focused input's own scroll view shifts to stay above the
      // keyboard) instead of resizing the whole WKWebView, which fights
      // with fixed-position headers/footers throughout the app.
      resize: "native",
    },
    PushNotifications: {
      // Otherwise a push that arrives while the app is already open and
      // foregrounded shows nothing at all -- iOS suppresses foreground
      // banners by default unless the app explicitly opts in.
      presentationOptions: ["badge", "sound", "banner", "list"],
    },
    SplashScreen: {
      // Held up until native-bootstrap.ts explicitly calls hide() once
      // React has actually mounted -- the plugin's own default timer would
      // otherwise auto-dismiss the splash as soon as the WebView's page
      // load event fires, which on a slow cold start can land well before
      // the app shell is actually ready to show, flashing an empty dark
      // screen in between.
      launchAutoHide: false,
      backgroundColor: "#0B0B0F",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
    },
  },
};

export default config;
