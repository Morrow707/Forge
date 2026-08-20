import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";
import { ForgeMark } from "@/components/forge-mark";
import { Trash2 } from "lucide-react";

/** Public, unauthenticated-reachable page describing account deletion --
 * Google Play requires a public URL for this even though the real action
 * only makes sense while logged in (Apple's equivalent requirement,
 * 5.1.1(v), only asks for the in-app flow, which is why this page also
 * offers the real dialog when there's an active session instead of only
 * ever describing the steps). */
export default function DeleteAccountPage() {
  const { user, isLoading } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <ForgeMark className="h-12 w-12 rounded-xl" />
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide">Delete Your Account</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>What gets deleted</CardTitle>
            <CardDescription>
              Deleting your Forge account is permanent and cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Deleting your account removes your profile, logged workouts and programs, and any video you recorded (form-check clips and skill drills). Numeric performance history tied only to your account goes with it.</p>
            <p>If you coach a roster, deleting your account does not delete your athletes' own accounts or data -- only your coach account and the content you own.</p>
          </CardContent>
        </Card>

        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        ) : user ? (
          <Button variant="destructive" className="w-full" onClick={() => setOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Delete my account
          </Button>
        ) : (
          <Card>
            <CardContent className="space-y-3 pt-6 text-sm text-muted-foreground">
              <p>You'll need to log in first -- account deletion has to be confirmed with your password.</p>
              <Button asChild className="w-full">
                <Link href="/login">Log in to delete my account</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
      {user && <DeleteAccountDialog open={open} onOpenChange={setOpen} />}
    </div>
  );
}
