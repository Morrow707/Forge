import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Sparkles,
  Video,
  LineChart,
  Apple,
  Trophy,
  ShieldCheck,
  Users,
  MessagesSquare,
  ArrowRight,
  Dumbbell,
  Target,
  CalendarCheck,
  Bot,
  Activity,
  Mail,
  Check,
  Snowflake,
  DollarSign,
} from "lucide-react";
import { ForgeMark } from "@/components/forge-mark";
import { MarketingNav, MarketingFooter } from "@/components/marketing-shell";
import { bandForAthleteCount, formatCents } from "@shared/billing-tiers";
import {
  FREE_AGENT_TIERS,
  FREE_AGENT_TIER_ORDER,
  FREE_AGENT_TIER_GRID_COLS,
} from "@shared/free-agent-tiers";
import { CAMERA_ACCURACY_LONG } from "@shared/camera-accuracy-copy";

/** A screenshot dressed up as a little browser window -- same treatment on
 * every feature screenshot so the marketing page reads as one coherent
 * product tour instead of loose, differently-cropped images. */
function BrowserFrame({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div
      className={
        "group overflow-hidden rounded-xl border border-border bg-surface shadow-2xl shadow-black/40 " +
        "transition-all duration-300 hover:-translate-y-1 hover:shadow-primary/20 " +
        (className ?? "")
      }
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-surface-elevated px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
      </div>
      {/* WEBP FIRST, PNG AS THE FALLBACK SOURCE.
          These screenshots were ~960kB of PNG across five files and are the heaviest thing a
          first-time visitor downloads -- PNG is lossless, which nothing needs for a picture of a
          dashboard. The .webp siblings are committed next to the originals (see
          scripts/optimize-marketing-images.mjs) and cut that by about 60%. The PNG stays as the
          <source> fallback and as the file a designer edits.

          loading/decoding are set for the same reason: these sit below the fold on every page
          that uses them, so blocking first paint on them is pure cost. */}
      <picture>
        <source srcSet={src.replace(/\.png$/, ".webp")} type="image/webp" />
        <img src={src} alt={alt} className="block w-full" loading="lazy" decoding="async" />
      </picture>
    </div>
  );
}

function GlowBlob({ className }: { className: string }) {
  return (
    <div
      aria-hidden
      className={"pointer-events-none absolute rounded-full bg-primary/25 blur-[100px] " + className}
    />
  );
}

const STATS = [
  { value: "150+", label: "Exercises in the library" },
  { value: "20+", label: "Sports with tailored programming" },
  { value: "5+", label: "AI features built in" },
  { value: "0", label: "Extra hardware required" },
];

const AI_CARDS = [
  {
    icon: Video,
    title: "AI Form Check",
    body: "Film a set on the phone that's already recording it and get feedback on bar path, depth, and rep quality -- the same kind of notes a coach standing right there would give.",
  },
  {
    icon: Bot,
    title: "AI Chat Coach",
    body: "Free Agents get a training partner built into the app -- ask a question about today's session and get an answer that already knows the program, the numbers, and the history.",
  },
  {
    icon: Activity,
    title: "Smart Autoregulation",
    body: "When a wellness check-in comes back rough, Forge adjusts what it recommends instead of pretending nothing changed.",
  },
  {
    icon: Mail,
    title: "Smart Goals & Digests",
    body: "Ask for a target and get one grounded in actual numbers, then get a plain-language recap of the week without opening a single chart.",
  },
];

const FEATURE_CARDS = [
  {
    icon: ShieldCheck,
    title: "Injury-risk aware",
    body: "Acute:chronic workload ratios and leg-drive asymmetry are calculated automatically from logged sets, flagging risk before it becomes an injury report.",
  },
  {
    icon: CalendarCheck,
    title: "Compliance, handled",
    body: "NCAA/CARA time-log tracking runs quietly in the background, so a coach never has to reconstruct hours after the fact.",
  },
  {
    icon: MessagesSquare,
    title: "One team board",
    body: "Announcements, Q&A, and coach-to-athlete feedback live in one place instead of scattered across texts and group chats.",
  },
  {
    icon: Users,
    title: "Built for whole programs",
    body: "Assistant coaches share a roster, teams get their own invite codes, and every athlete's history stays intact as they move between them.",
  },
];

const AUDIENCES = [
  {
    icon: Dumbbell,
    title: "Coaches",
    body: "Build programs in minutes with an AI that understands periodization, assign them to a whole roster, and see exactly how every athlete is responding -- not just whether they showed up.",
  },
  {
    icon: Target,
    title: "Athletes",
    body: "Open today's workout and everything is already there: sets, video, last time's numbers, and a rest timer that knows the difference between a superset and a straight set.",
  },
  {
    icon: Sparkles,
    title: "Free Agents",
    body: "Training on your own? Forge's AI becomes your coach -- building programs, answering questions, and adjusting based on how you're actually recovering.",
  },
];

// Derived from the shared pricing modules, never re-typed here. This page
// used to declare its own FREE_AGENT_TIERS ("Base $29.99 / Pro $39.99") and
// its own COACH_SEAT_TIERS (four seat bands with Base/Pro columns), neither
// of which matched what /pricing renders one click deeper from the same
// shared source -- different tier names and roughly 3x the price for the
// same product. The pricing section happened to be hidden behind
// PRICING_SECTION_LIVE, so nobody ever saw the two pages disagree, which is
// exactly why it survived. Deriving removes the possibility.
const FREE_AGENT_CARDS = FREE_AGENT_TIER_ORDER.map((id) => {
  const tier = FREE_AGENT_TIERS[id];
  return {
    name: tier.label,
    price: formatCents(tier.monthlyPriceCents),
    features: [
      "AI program builder",
      ...(tier.hasAiChat ? ["AI chat coach"] : []),
      "Camera bar-velocity, sprint & jump tracking",
      ...(tier.hasVideoFormCheck
        ? ["AI form-check on your lifts", "Form-check video logging"]
        : []),
    ],
  };
});

// The real org model is a flat base fee plus a flat per-athlete rate with no
// volume discount and no feature tiers; the 25-athlete bands are a
// presentation of that formula. These four roster sizes are just sample
// points on it, priced by the same function /pricing uses.
const COACH_SAMPLE_ROSTERS = [15, 50, 100, 250].map((n) => ({
  seats: `Up to ${n}`,
  price: formatCents(bandForAthleteCount(n).monthlyPriceCents),
}));

// Off by default -- the app is still in testing, so the pricing section
// stays out of the public landing page even though it's fully built (same
// "framework's there, hold it off" posture as server/billing.ts's own
// BILLING_LIVE, which this should flip alongside once billing actually
// goes live, not before).
const PRICING_SECTION_LIVE = false;

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Nav and footer are shared with the audience and validation pages -- see
          components/marketing-shell.tsx. They were inline here until those pages existed, at
          which point three hand-kept copies of one nav became three places a new link gets
          added to two of. */}
      <MarketingNav />

      {/* ---------------- Hero ---------------- */}
      <section className="relative isolate overflow-hidden px-4 pb-20 pt-16 md:px-8 md:pb-28 md:pt-24">
        <GlowBlob className="-left-32 -top-32 h-96 w-96" />
        <GlowBlob className="-right-32 top-40 h-96 w-96 bg-primary/15" />
        <div className="relative mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            AI-powered strength &amp; conditioning
          </span>
          <h1 className="mt-6 font-display text-5xl font-extrabold uppercase leading-[1.05] tracking-wide md:text-7xl">
            Coach smarter.
            <br />
            <span className="text-primary">Train harder.</span>
            <br />
            Perform better.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Forge is the training platform that builds programs with you, watches every rep
            through the camera already in your pocket, and turns raw sets and reps into
            answers a coach can actually act on.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup">
              <Button size="lg" className="w-full sm:w-auto">
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Log In
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Free to get started -- no credit card required.
          </p>
        </div>

        <div className="relative mx-auto mt-16 max-w-5xl">
          <BrowserFrame src="/marketing/shot-dashboard.png" alt="Forge coach dashboard" />
        </div>
      </section>

      {/* ---------------- Stat bar ---------------- */}
      <section className="border-y border-border bg-surface px-4 py-10 md:px-8">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 text-center md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="font-display text-4xl font-extrabold text-primary">{s.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Feature: AI Program Builder ---------------- */}
      <section className="px-4 py-20 md:px-8 md:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              AI program builder
            </span>
            <h2 className="mt-4 font-display text-4xl font-bold uppercase tracking-wide md:text-5xl">
              Describe the program.
              <br />
              Watch it get built.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Tell Forge's AI what you're training for -- a 5-day collegiate baseball split, a
              return-to-play block, a 4-week peaking cycle -- and it drafts the whole thing:
              exercises, sets, reps, supersets, and rest, pulled from your own exercise library.
              Keep chatting with it right inside the builder to adjust anything, on any program,
              at any time.
            </p>
          </div>
          <BrowserFrame
            src="/marketing/shot-program-builder.png"
            alt="AI program builder building a training week"
          />
        </div>
      </section>

      {/* ---------------- AI throughout Forge ---------------- */}
      <section className="relative isolate overflow-hidden border-y border-primary/20 bg-surface px-4 py-20 md:px-8 md:py-28">
        <GlowBlob className="left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 bg-primary/10" />
        <div className="relative mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <Bot className="h-3.5 w-3.5" />
              AI, everywhere that matters
            </span>
            <h2 className="mt-4 font-display text-4xl font-bold uppercase tracking-wide md:text-5xl">
              Not a chatbot bolted on the side
            </h2>
            <p className="mt-4 text-muted-foreground">
              The AI program builder is just the start. The same intelligence shows up
              everywhere training actually takes time -- reading form, reading recovery, and
              turning raw numbers into plain answers.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {AI_CARDS.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-primary/20 bg-background p-6 transition-colors hover:border-primary/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Feature: Analytics ---------------- */}
      <section className="bg-surface px-4 py-20 md:px-8 md:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
          <div className="order-2 md:order-1">
            <BrowserFrame src="/marketing/shot-analytics.png" alt="Muscle load map analytics" />
          </div>
          <div className="order-1 md:order-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <LineChart className="h-3.5 w-3.5" />
              Real analytics
            </span>
            <h2 className="mt-4 font-display text-4xl font-bold uppercase tracking-wide md:text-5xl">
              Know exactly where
              <br />
              the load is going.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Every logged set rolls up into a muscle load map, weekly volume and intensity
              trends, and an acute:chronic workload ratio -- automatically, with zero extra
              data entry. Bar speed, jump height, and rep-by-rep velocity decay come straight
              from the camera your athletes are already using.
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Video className="h-4 w-4 shrink-0 text-primary" />
              No wearables, no extra hardware -- just a phone camera.
            </div>
            {/* Directly under the claim it qualifies. It first went in the pricing
                section below, which reads like the right place and is not: that whole
                section sits behind PRICING_SECTION_LIVE, currently false, so the
                warning rendered nowhere while the paragraph above -- "bar speed, jump
                height, and rep-by-rep velocity decay come straight from the camera" --
                went out unqualified to every visitor. Keep these together. */}
            <div className="mt-4 flex items-start gap-2 rounded-md border-2 border-destructive bg-destructive/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm font-bold text-destructive">{CAMERA_ACCURACY_LONG}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Feature: Gamification ---------------- */}
      <section className="px-4 py-20 md:px-8 md:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <Trophy className="h-3.5 w-3.5" />
              Gamification
            </span>
            <h2 className="mt-4 font-display text-4xl font-bold uppercase tracking-wide md:text-5xl">
              Every milestone.
              <br />
              Earned and saved.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Trophies stack like a real collection -- every threshold an athlete ever crosses
              stays unlocked, even after a streak breaks. Locked ones stay visible too, greyed
              out with exactly what it takes to earn them, so the next goal is never a mystery.
              Team leaderboards and daily streaks turn consistency into something everyone can
              see, not just a number sitting in the coach's spreadsheet.
            </p>
          </div>
          <BrowserFrame src="/marketing/shot-trophies.png" alt="Athlete trophy case" />
        </div>
      </section>

      {/* ---------------- Feature: Nutrition ---------------- */}
      <section className="bg-surface px-4 py-20 md:px-8 md:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
          <div className="order-2 md:order-1">
            <BrowserFrame src="/marketing/shot-nutrition.png" alt="Food log with macro tracking" />
          </div>
          <div className="order-1 md:order-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <Apple className="h-3.5 w-3.5" />
              Nutrition
            </span>
            <h2 className="mt-4 font-display text-4xl font-bold uppercase tracking-wide md:text-5xl">
              Log a meal
              <br />
              in seconds.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Snap a photo, scan a barcode, or type it in -- Forge fills in the macros (and the
              micros) automatically and rolls them up against whatever targets the coach set.
              No spreadsheets, no manual math, just a running total that updates the moment
              food gets logged.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- Feature grid ---------------- */}
      <section className="px-4 py-20 md:px-8 md:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-4xl font-bold uppercase tracking-wide md:text-5xl">
              Everything else a program needs
            </h2>
            <p className="mt-4 text-muted-foreground">
              Forge isn't just a program builder -- it's the whole operation, from injury-risk
              flagging to the compliance report.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURE_CARDS.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-surface p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Audiences ---------------- */}
      <section className="bg-surface px-4 py-20 md:px-8 md:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-4xl font-bold uppercase tracking-wide md:text-5xl">
              Built for every seat on the team
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {AUDIENCES.map((a) => (
              <div
                key={a.title}
                className="rounded-xl border border-border bg-background p-8 text-center"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <a.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-display text-xl font-bold uppercase tracking-wide">
                  {a.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Pricing (hidden until PRICING_SECTION_LIVE) ---------------- */}
      {PRICING_SECTION_LIVE && (
      <section className="bg-surface px-4 py-20 md:px-8 md:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <DollarSign className="h-3.5 w-3.5" />
              Pricing
            </span>
            <h2 className="mt-4 font-display text-4xl font-bold uppercase tracking-wide md:text-5xl">
              No hidden fees. Ever.
            </h2>
            <p className="mt-4 text-muted-foreground">
              One price, shown up front, for exactly what's included -- whether you're training
              on your own or running a whole program. Every plan starts with a 14-day free trial
              with everything unlocked, no credit card required.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {/* Free Agent */}
            <div className="rounded-xl border border-border bg-background p-6 md:p-8">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="font-display text-xl font-bold uppercase tracking-wide">
                  Free Agent
                </h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Training on your own.</p>
              <div className={cn("mt-6 grid gap-4 sm:grid-cols-2", FREE_AGENT_TIER_GRID_COLS)}>
                {FREE_AGENT_CARDS.map((t) => (
                  <div key={t.name} className="rounded-lg border border-border p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {t.name}
                    </p>
                    <p className="mt-1 font-display text-3xl font-extrabold">
                      {t.price}
                      <span className="text-sm font-normal text-muted-foreground">/mo</span>
                    </p>
                    <ul className="mt-4 space-y-2">
                      {t.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          <span className="text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Coach / Team */}
            <div className="rounded-xl border border-border bg-background p-6 md:p-8">
              <div className="flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-primary" />
                <h3 className="font-display text-xl font-bold uppercase tracking-wide">
                  Coach / Team
                </h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Priced by roster size -- pay for the athletes you actually coach.
              </p>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 font-semibold">Roster</th>
                      <th className="pb-2 font-semibold">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COACH_SAMPLE_ROSTERS.map((row) => (
                      <tr key={row.seats} className="border-b border-border last:border-0">
                        <td className="py-3 text-muted-foreground">{row.seats}</td>
                        <td className="py-3 font-display font-bold">{row.price}<span className="text-xs font-normal text-muted-foreground">/mo</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Every roster size gets the same thing: the AI program builder, camera tracking,
                Health sync, recovery trends, and the full analytics suite. The rate per athlete
                never changes, so the price only moves when your roster does.
              </p>
            </div>
          </div>

          <div className="mx-auto mt-6 flex max-w-3xl items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-5">
            <Snowflake className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Off-season is free.</span> Pause
              any plan and your dashboards, videos, and history stay exactly as you left them --
              no charge while you're not actively training or coaching. Resume whenever you're
              back.
            </p>
          </div>

          <p className="mx-auto mt-6 max-w-3xl text-center text-xs text-muted-foreground">
            Pricing reflects our launch plan and isn't live for billing yet -- signing up today
            is free either way. Optional add-ons (branding, extra video storage, sport
            specialists) are listed in full on the pricing page -- nothing is charged that
            isn't shown there first.
          </p>
        </div>
      </section>
      )}

      {/* ---------------- Final CTA ---------------- */}
      <section className="relative isolate overflow-hidden px-4 py-24 text-center md:px-8">
        <GlowBlob className="left-1/2 top-0 h-96 w-96 -translate-x-1/2" />
        <div className="relative mx-auto max-w-2xl">
          <ForgeMark className="mx-auto h-14 w-14 rounded-xl" />
          <h2 className="mt-6 font-display text-4xl font-extrabold uppercase tracking-wide md:text-5xl">
            Ready to forge better athletes?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Create a free account and build your first program in the next five minutes.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup">
              <Button size="lg" className="w-full sm:w-auto">
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Log In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <MarketingFooter />
    </div>
  );
}
