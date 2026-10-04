import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { getJson } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ForgeMark } from "@/components/forge-mark";
import { ReadFailed } from "@/components/read-failed";
import { ArrowLeft, Printer } from "lucide-react";
import { format } from "date-fns";

type Certificate = {
  className: string;
  athleteName: string;
  lessonCount: number;
  quizCount: number;
  estimatedMinutes: number;
  completedAt: string;
};

/** A printable certificate for one finished class (2026-10-04), the athlete-side twin of the
 * Coaches Corner certificate. Every fact comes from the server, which refuses to issue one
 * until the enrollment is marked complete. It names Forge as the issuer and nothing else. */
export default function AthleteClassCertificate() {
  const { id } = useParams<{ id: string }>();
  const url = `/api/athlete/classes/${id}/certificate`;
  const { data, isLoading, isError, error, refetch } = useQuery<Certificate>({
    queryKey: [url],
    queryFn: () => getJson(url),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="h-64 w-full max-w-2xl animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-4 text-center">
          <ReadFailed what="the certificate" onRetry={() => void refetch()} />
          {error instanceof Error && <p className="text-sm text-muted-foreground">{error.message}</p>}
          <Button asChild variant="outline" size="sm">
            <Link href={`/athlete/classes/${id}`}>Back to the class</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link href={`/athlete/classes/${id}`}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print or save as PDF
        </Button>
      </div>
      <div className="mx-auto max-w-2xl rounded-xl border-2 border-primary/40 bg-card p-10 text-center print:border-black print:text-black">
        <ForgeMark className="mx-auto h-10 w-10" />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Certificate of completion
        </p>
        <h1 className="mt-6 font-display text-3xl font-bold uppercase tracking-wide">{data.athleteName}</h1>
        <p className="mt-3 text-sm text-muted-foreground">has completed the class</p>
        <h2 className="mt-2 font-display text-2xl font-bold">{data.className}</h2>
        <div className="mx-auto mt-8 grid max-w-sm grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-2xl font-bold">{data.lessonCount}</p>
            <p className="text-xs text-muted-foreground">lessons read</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{data.estimatedMinutes || "—"}</p>
            <p className="text-xs text-muted-foreground">minutes of reading</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{data.quizCount}</p>
            <p className="text-xs text-muted-foreground">quizzes passed</p>
          </div>
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          Completed {format(new Date(data.completedAt), "MMMM d, yyyy")}
        </p>
        <p className="mt-6 text-xs text-muted-foreground">
          Issued by Forge Performance Systems. This certificate records study completed on Forge
          and is not a credential from any certifying body.
        </p>
      </div>
    </div>
  );
}
