// Capacitor's own fixed default origins for the iOS/Android WKWebView/WebView
// shell -- never user-controlled. One shared definition so index.ts's
// CORS/CSRF config and auth.ts's login-kind detection (session-tracking.ts)
// can't drift apart from each other.
export const NATIVE_APP_ORIGINS = ["capacitor://localhost", "https://localhost"];
