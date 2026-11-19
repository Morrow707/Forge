import { useQuery } from "@tanstack/react-query";
import { getJson, resolveApiUrl } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { ForgeMark } from "@/components/forge-mark";
import { computeBrandingStyle, type EffectiveBranding } from "@/lib/branding-style";

/** THE PROGRAM ON A CERTIFICATE (2026-11-19). A certificate is still issued by Forge -- that is
 *  what it certifies -- but an athlete or coach on a branded program receives it in the
 *  program's colors with its logo and name above Forge's mark, as "presented through". A Free
 *  Agent's certificate is unchanged. */
export function useProgramBranding() {
  const { user } = useAuth();
  const { data } = useQuery<EffectiveBranding | null>({
    queryKey: ["/api/branding/me"],
    queryFn: () => getJson("/api/branding/me"),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  return { branding: data ?? null, style: computeBrandingStyle(data ?? null) };
}

export function ProgramCertificateMark({ branding }: { branding: EffectiveBranding | null }) {
  const logo = branding?.brandExtras?.wordmarkUrl ?? branding?.brandLogoUrl ?? null;
  const name = branding?.brandTeamName?.trim() || null;
  if (!logo && !name) return <ForgeMark className="mx-auto h-10 w-10" />;
  return (
    <div className="flex flex-col items-center gap-2">
      {logo && <img src={resolveApiUrl(logo)} alt={name ?? "Program"} className="mx-auto h-14 max-w-[16rem] object-contain" />}
      {name && <p className="font-display text-lg font-bold uppercase tracking-wide">Presented through {name}</p>}
      <ForgeMark className="mx-auto h-6 w-6 opacity-80" />
    </div>
  );
}
