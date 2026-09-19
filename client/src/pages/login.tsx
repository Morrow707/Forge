import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgeMark } from "@/components/forge-mark";
import { MfaLoginStep } from "@/components/mfa-login-step";
import { DeviceApprovalStep } from "@/components/device-approval-step";
import { isNativeLoginAvailable, presentNativeLogin } from "@/lib/native-auth";

export default function LoginPage() {
  const { user, isLoading, loginMutation, deviceApprovalCompleteMutation } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // On iOS the SAME login screen is drawn in native code and shown instead of the form below.
  // Not a second screen and not a sheet over this one -- it is this screen, from the same colour
  // tokens and the same mark, presented full screen, because native text fields are the only
  // thing on current iOS that Apple Passwords will fill from and offer to save to. See
  // native-auth.ts for why the webview form cannot, whatever it is marked up as.
  //
  // Everywhere else -- the browser, Android -- this state is false from the first render and the
  // form below is the login screen, exactly as it was.
  const [nativeShowing, setNativeShowing] = useState(isNativeLoginAvailable);
  // Read inside the presenter so a re-present after a wrong password can prefill the address
  // that was just typed, without making the callback depend on the state and re-fire.
  const emailRef = useRef("");
  emailRef.current = email;

  const present = useCallback(() => {
    presentNativeLogin(emailRef.current || undefined).then((outcome) => {
      // null is web/unavailable/native failure; dismissed is the athlete swiping it away. Both
      // mean the same thing here: fall back to the form, which still logs in.
      if (!outcome || outcome.action === "dismissed") {
        setNativeShowing(false);
        return;
      }
      if (outcome.action === "navigate") {
        // The links on it -- forgot password, sign up, admin -- are web routes.
        setNativeShowing(false);
        setLocation(outcome.path);
        return;
      }
      setEmail(outcome.username);
      setPassword(outcome.password);
      // Straight into the mutation the form's own submit uses. The native screen collects
      // credentials; it does not authenticate.
      loginMutation.mutate({ email: outcome.username, password: outcome.password });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loginMutation is stable per mount
  }, [setLocation]);

  useEffect(() => {
    if (!nativeShowing) return;
    present();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  // A rejected sign-in has to put the screen back, or the athlete is left looking at a status
  // line with no way to retype anything. isError flips back to false the moment mutate() runs
  // again, so this cannot loop.
  useEffect(() => {
    if (nativeShowing && loginMutation.isError) present();
  }, [nativeShowing, loginMutation.isError, present]);

  if (!isLoading && user) {
    return (
      <Redirect
        to={
          user.role === "coach"
            ? "/coach"
            : user.role === "admin"
              ? "/admin"
              : user.role === "guardian"
                ? "/guardian"
                : "/athlete"
        }
      />
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    loginMutation.mutate({ email, password });
  }

  // Two ways to reach the authenticator step: straight from the password on a
  // trusted device, or after the email has approved a new one. Device first,
  // then code -- see server/trusted-devices.ts.
  const mfaPending =
    loginMutation.data && "mfaRequired" in loginMutation.data
      ? loginMutation.data
      : deviceApprovalCompleteMutation.data && "mfaRequired" in deviceApprovalCompleteMutation.data
        ? deviceApprovalCompleteMutation.data
        : null;
  const devicePending =
    !mfaPending && loginMutation.data && "deviceApprovalRequired" in loginMutation.data ? loginMutation.data : null;

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-4"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <ForgeMark className="h-14 w-14 rounded-xl" />
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-wider">
            Forge
          </h1>
          <p className="text-sm text-muted-foreground">Coach. Program. Perform.</p>
        </div>

        {nativeShowing && !mfaPending && !devicePending ? (
          // What sits behind the native screen. It is presented full screen and cannot be swiped
          // away, so this is only ever seen for the instant between a sign-in attempt and the
          // screen coming back or the redirect firing -- but a half-drawn form flashing there is
          // exactly the thing that made the last attempt look broken.
          <p className="text-center text-sm text-muted-foreground">
            {loginMutation.isPending ? "Logging in\u2026" : "Opening sign in\u2026"}
          </p>
        ) : devicePending ? (
          <DeviceApprovalStep
            email={email}
            password={password}
            pollToken={devicePending.pollToken}
            emailHint={devicePending.emailHint}
            onBack={() => {
              loginMutation.reset();
              deviceApprovalCompleteMutation.reset();
              if (nativeShowing) present();
            }}
          />
        ) : mfaPending ? (
          <MfaLoginStep
            email={email}
            password={password}
            mfaToken={mfaPending.mfaToken}
            onBack={() => {
              loginMutation.reset();
              // On iOS the screen behind this one is the status line, not the form -- backing
              // out of the code step has to bring the native screen back or there is nothing
              // to type into.
              if (nativeShowing) present();
            }}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Welcome back</CardTitle>
            </CardHeader>
            <CardContent>
              {/* noValidate: WKWebView's native HTML5 constraint-validation UI
                  (e.g. a type="email" field it considers malformed) can block
                  the submit event before handleSubmit's preventDefault ever
                  runs and surface its own ugly WebKit error text inline
                  instead of a popover -- same risk on every auth form here,
                  so submission is always handled entirely by JS/React state. */}
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <PasswordInput
                    id="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Logging in…" : "Log In"}
                </Button>
              </form>
              <p className="mt-5 text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <Link href="/signup" className="font-semibold text-primary hover:underline">
                  Sign up
                </Link>
              </p>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Are you an admin?{" "}
                <Link href="/admin/login" className="font-semibold text-primary hover:underline">
                  Log in here
                </Link>
              </p>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                <Link href="/pricing" className="font-semibold text-primary hover:underline">
                  View pricing
                </Link>
              </p>
            </CardContent>
          </Card>
        )}

        {/* Dev-only -- server/seed.ts's demoPassword() randomizes these accounts' actual
            passwords in production (crypto.randomUUID(), never these literals), but the
            published emails alone are still enough to hand an attacker a head start on
            credential-stuffing/enumeration against real, always-existing accounts. No reason
            to advertise them outside local dev, where the literal passwords below are real. */}
        {import.meta.env.DEV && (
          <div className="mt-6 rounded-md border border-border bg-surface p-4 text-xs text-muted-foreground">
            <p className="mb-1 font-semibold text-foreground">Demo accounts</p>
            <p>Coach: coach@forge.app / coach123</p>
            <p>Athlete: athlete@forge.app / athlete123</p>
            <p>Free Agent: freeagent@forge.app / freeagent123</p>
          </div>
        )}
      </div>
    </div>
  );
}
