import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ForgeMark } from "@/components/forge-mark";
import { getJson, resolveApiUrl } from "@/lib/queryClient";
import { Mail } from "lucide-react";

type PublicTeam = {
  teamName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  motto: string | null;
  mission: string | null;
  contactEmail: string | null;
};

/**
 * A program's public page, at /team/:code, with no account required.
 *
 * Team Identity is sold as including a "public contact email" and a mission/About
 * page, and the only About page Forge had was behind a login -- so the public half of
 * what a coach paid for did not exist. This is it: the link a coach can put on a
 * flyer or in an email to a parent.
 *
 * Only the fields that add-on covers, and only when the program actually has it (the
 * server decides that, not this page). The athlete welcome message is deliberately
 * not here -- it is addressed to somebody who has already joined.
 */
export default function PublicTeamPage() {
  const { code } = useParams<{ code: string }>();
  const { data, isLoading, isError } = useQuery<PublicTeam>({
    queryKey: ["/api/public/team", code],
    queryFn: () => getJson(`/api/public/team/${encodeURIComponent(code)}`),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="h-32 w-full max-w-md animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <ForgeMark className="h-8 w-8" />
            <p className="font-semibold">No program with that code</p>
            <p className="text-sm text-muted-foreground">
              Check the code on whatever you were given, or ask the coach for a new link.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/">Go to Forge</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background px-4 py-10"
      // The program's own colour, when it has one -- the whole point of the add-on.
      style={data.primaryColor ? { borderTop: `4px solid ${data.primaryColor}` } : undefined}
    >
      <div className="mx-auto max-w-xl space-y-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            {data.logoUrl && (
              <img
                src={resolveApiUrl(data.logoUrl)}
                alt={data.teamName ?? "Team logo"}
                className="h-20 w-20 rounded-xl object-contain"
              />
            )}
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide">
              {data.teamName ?? "This program"}
            </h1>
            {data.motto && <p className="italic text-muted-foreground">"{data.motto}"</p>}
          </CardContent>
        </Card>

        {data.mission && (
          <Card>
            <CardContent className="space-y-1.5 p-5">
              <p className="label-xs">About</p>
              <p className="whitespace-pre-line text-sm">{data.mission}</p>
            </CardContent>
          </Card>
        )}

        {data.contactEmail && (
          <Card>
            <CardContent className="flex items-center gap-2 p-5 text-sm">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <a
                href={`mailto:${data.contactEmail}`}
                className="font-semibold text-primary hover:underline"
              >
                {data.contactEmail}
              </a>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-5 text-center">
            <p className="text-sm text-muted-foreground">
              This program trains on Forge. If you were given a code to join, start here.
            </p>
            <Button asChild size="sm">
              <Link href={`/signup?code=${encodeURIComponent(code)}`}>Join this program</Link>
            </Button>
          </CardContent>
        </Card>

        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ForgeMark className="h-3.5 w-3.5" />
          Powered by Forge
        </p>
      </div>
    </div>
  );
}
