import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** "Tell me when Forge opens." The one form that joins the launch email list, drawn on the
 * coming-soon card and in the marketing footer. POST /api/public/email-list answers the same
 * for a new address and a repeat, so the thank-you here never says which it was.
 * server/email-list.ts has the rules. */
export function EmailListSignup({
  source,
  className,
  compact,
}: {
  source: "signup" | "footer";
  className?: string;
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/public/email-list", { email, source });
    },
    onSuccess: () => setJoined(true),
  });

  if (joined) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)} role="status">
        You're on the list. We'll email you when Forge opens.
      </p>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    mutation.mutate();
  };

  return (
    <form onSubmit={onSubmit} className={cn("space-y-2", className)}>
      {!compact && (
        <p className="text-sm text-muted-foreground">
          Want to know when sign-ups open, and hear about launch offers? Leave your email.
        </p>
      )}
      <div className="flex gap-2">
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address for launch updates"
          className={compact ? "h-9" : undefined}
        />
        <Button type="submit" size={compact ? "sm" : "default"} disabled={mutation.isPending || !email.trim()}>
          <Mail className="h-4 w-4" />
          {mutation.isPending ? "Joining…" : "Notify me"}
        </Button>
      </div>
      {mutation.isError && (
        <p className="text-sm text-destructive">
          {mutation.error instanceof ApiError ? mutation.error.message : "That didn't go through. Try again."}
        </p>
      )}
      {!compact && (
        <p className="text-xs text-muted-foreground">Launch news only. Every email has an unsubscribe link.</p>
      )}
    </form>
  );
}
