import { db } from "./db";
import { guardianLinks, users } from "@shared/schema";
import { eq, inArray, isNull } from "drizzle-orm";
import { storage } from "./storage";
import { sendEmail, escapeHtml } from "./email";
import { coreAgreementText } from "./seed-data/signup-agreement";

/**
 * ACTUAL NOTICE THAT THE TERMS CHANGED -- the guardian half of it.
 *
 * Counsel's rule is that an updated agreement binds an existing user only if they were given
 * actual notice and a chance to accept or reject. An adult gets that notice in the app: the next
 * time they sign in, /api/auth/me carries needsTermsAcceptance and the client puts the new terms
 * in front of them. That is a real notice because the person meeting it is the person who must
 * answer.
 *
 * A minor cannot answer, so showing THEM anything is not notice to anybody who can act on it.
 * The person who must answer is a guardian who may not open the app for weeks, which leaves an
 * email as the only channel that reaches them. Hence this, and only this: no email is sent to an
 * adult, whose in-app gate already is the notice.
 *
 * ONE EMAIL PER GUARDIAN, not per athlete -- a parent with three athletes on Forge gets one
 * message naming all three.
 *
 * IDEMPOTENT ACROSS REDEPLOYS via users.termsReacceptNotifiedAt on the MINOR's row. The seed runs
 * on every deploy, so without the mark every redeploy would re-send the same email until the
 * guardian answered. It is on the athlete's row rather than the guardian's because the question
 * is per-athlete: a second athlete going stale later must not be silenced by an email about the
 * first. Accepting clears it (see acceptCurrentTerms), so the NEXT change asks again.
 *
 * BEST EFFORT. A mail failure must not fail a deploy; an unsent notice is retried on the next
 * one, because the mark is only written for a guardian whose send was attempted.
 */
export async function notifyGuardiansOfTermsChange(): Promise<{
  guardiansEmailed: number;
  athletesMarked: number;
}> {
  const live = coreAgreementText(await storage.getLegalAgreement());
  const rows = await db
    .select({
      guardianId: guardianLinks.guardianId,
      athleteId: users.id,
      athleteName: users.name,
      agreedToTermsText: users.agreedToTermsText,
    })
    .from(guardianLinks)
    .innerJoin(users, eq(users.id, guardianLinks.athleteId))
    .where(isNull(users.termsReacceptNotifiedAt));

  const stale = rows.filter((r) => coreAgreementText(r.agreedToTermsText ?? "") !== live);
  if (stale.length === 0) return { guardiansEmailed: 0, athletesMarked: 0 };

  const byGuardian = new Map<number, typeof stale>();
  for (const row of stale) {
    const list = byGuardian.get(row.guardianId) ?? [];
    list.push(row);
    byGuardian.set(row.guardianId, list);
  }

  let guardiansEmailed = 0;
  const marked: number[] = [];
  for (const [guardianId, athletes] of byGuardian) {
    const [guardian] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, guardianId))
      .limit(1);
    if (!guardian?.email) continue;
    try {
      await sendEmail({
        to: guardian.email,
        subject: "Forge's terms have changed -- please review",
        html: buildTermsChangeEmail(
          guardian.name,
          athletes.map((a) => a.athleteName),
        ),
      });
      guardiansEmailed += 1;
    } catch {
      // Deliberately swallowed and NOT marked: the athletes below stay unmarked only when the
      // send threw, so the next deploy tries again.
      continue;
    }
    marked.push(...athletes.map((a) => a.athleteId));
  }

  if (marked.length > 0) {
    await db
      .update(users)
      .set({ termsReacceptNotifiedAt: new Date() })
      .where(inArray(users.id, marked));
  }
  return { guardiansEmailed, athletesMarked: marked.length };
}

export function buildTermsChangeEmail(guardianName: string, athleteNames: string[]): string {
  const names = athleteNames.map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <div style="background:#F65B23;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">FORGE</span>
      </div>
      <div style="padding:24px;">
        <h1 style="font-size:20px;margin:0 0 4px;">Forge's Terms of Use have changed</h1>
        <p style="color:#555;margin:0 0 16px;">
          ${escapeHtml(guardianName)}, the terms that cover your athlete's use of Forge have been
          updated. Because they are under 18, the decision is yours rather than theirs.
        </p>
        <p style="color:#555;margin:0 0 8px;">This affects:</p>
        <ul style="color:#555;margin:0 0 16px;">${names}</ul>
        <p style="color:#555;margin:0 0 16px;">
          Sign in to Forge and open your guardian dashboard to read the new terms and accept or
          decline them. Your athlete can keep training in the meantime -- nothing is switched off
          while you decide.
        </p>
        <p style="color:#999;font-size:12px;margin:0;">
          You are receiving this because you are listed as a parent or guardian on a Forge account.
        </p>
      </div>
    </div>
  `;
}
