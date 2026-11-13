/**
 * "YOUR PROGRAM'S PLAN HAS ENDED." Added 2026-11-13 with the trial-ending note.
 *
 * When a coach subscription ends, the band is cleared (storage.clearCoachBand) and from that
 * moment the coach and every athlete on the roster lose filming and skill recording (see
 * coachPlanIsActive in routes.ts). The athletes are told on their own screens; this is how the
 * person who can fix it finds out. Fire-and-forget on purpose: a mail problem must never fail
 * the webhook that ended the subscription. No link and no website named -- see
 * trial-ending-job.ts for why.
 */
import { sendEmail } from "./email";
import { emailShell } from "./email-shell";
import { storage } from "./storage";

export function buildCoachPlanEndedEmail(firstName: string) {
  const p = (text: string) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px;">${text}</p>`;
  return {
    subject: "Your Forge plan has ended",
    html: emailShell(
      "Your Forge plan has ended",
      p(`Hi ${firstName},`) +
        p("Your program's Forge plan has ended, so filming, skill sessions and the AI tools are paused for you and for the athletes on your roster.") +
        p("Nothing has been removed. Your roster, your programs and everything already recorded are still there, and it all opens again as soon as the plan is active."),
    ),
  };
}

export function notifyCoachPlanEnded(coachUserId: number): void {
  void (async () => {
    try {
      const coach = await storage.getUser(coachUserId);
      if (!coach || coach.role !== "coach" || coach.isBetaAccount) return;
      const firstName = (coach.name ?? "").trim().split(/\s+/)[0] || "there";
      const email = buildCoachPlanEndedEmail(firstName);
      await sendEmail({ to: coach.email, subject: email.subject, html: email.html });
    } catch (err) {
      console.error("plan-ended email failed:", err);
    }
  })();
}
