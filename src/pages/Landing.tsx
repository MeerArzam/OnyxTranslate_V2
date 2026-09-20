import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Database,
  FileJson,
  PauseCircle,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { RESCUE } from "@/lib/rescue-facts";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

const PHASES = [
  {
    tag: "A",
    title: "Read-only forensics",
    body: "8 candidate function paths probed via the raw HTTP API. Every response and error logged verbatim with timestamps.",
  },
  {
    tag: "B",
    backup: true,
    title: "Full data backup",
    body: "All projects → translations → chunks dumped to a timestamped JSON plus a markdown summary of row counts and job state.",
  },
  {
    tag: "C",
    title: "Safe-resume attempt",
    body: "Only the designated resumeServerProject entry points were probed as mutations — never updateProject. 3× progress polling on success.",
  },
  {
    tag: "D",
    title: "Report",
    body: "rescue/report.html generated and mirrored into public/docs/ with working paths, stats, and a recommended next step.",
  },
];

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const primaryHref = isLoading ? "/dashboard" : isAuthenticated ? "/dashboard" : "/auth";
  const primaryLabel = isLoading
    ? "Mission control"
    : isAuthenticated
      ? "Open mission control"
      : "Enter mission control";

  return (
    <motion.div
      initial="hidden"
      animate="show"
      className="relative min-h-screen overflow-hidden"
    >
      {/* Modern backdrop: soft grid + accent glow */}
      <div className="pointer-events-none absolute inset-0 grid-backdrop" aria-hidden />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
        aria-hidden
      />

      {/* Navbar */}
      <header className="relative z-10 border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </span>
            <span className="text-sm font-bold tracking-tight">OnyxTranslate Rescue</span>
          </Link>
          <nav className="flex items-center gap-2">
            <a
              href="/docs/rescue-report.html"
              target="_blank"
              rel="noreferrer"
              className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Report
            </a>
            <Button asChild size="sm" className="cursor-pointer">
              <Link to={primaryHref}>{primaryLabel}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <section className="flex flex-col items-center py-20 text-center sm:py-28">
          <motion.div variants={fadeUp} custom={0}>
            <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
              <PauseCircle className="size-3.5" />
              Old deployment found PAUSED
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            custom={1}
            className="mt-6 max-w-3xl text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl"
          >
            Recover every word from the{" "}
            <span className="text-primary">OnyxTranslate</span> backend
          </motion.h1>

          <motion.p
            variants={fadeUp}
            custom={2}
            className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8"
          >
            A read-only rescue operation against the frozen{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
              successful-iguana-419
            </code>{" "}
            deployment — forensics, full data backup, a guard-railed safe-resume
            attempt, and a complete report. No destructive calls, ever.
          </motion.p>

          <motion.div variants={fadeUp} custom={3} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="cursor-pointer">
              <Link to={primaryHref}>
                {primaryLabel}
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="cursor-pointer">
              <a href="/docs/rescue-report.html" target="_blank" rel="noreferrer">
                <FileJson className="mr-1 size-4" />
                View rescue report
              </a>
            </Button>
          </motion.div>

          <motion.p variants={fadeUp} custom={4} className="mt-4 text-xs text-muted-foreground">
            Scripts: <code className="font-mono">scripts/rescue/phase-a…d.mjs</code> · Artifacts:{" "}
            <code className="font-mono">rescue/</code> · Signed in? Go straight to the dashboard.
          </motion.p>
        </section>

        {/* Verdict banner */}
        <motion.section variants={fadeUp} custom={5} className="pb-14">
          <Card className="card-layer overflow-hidden border-destructive/25">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <AlertTriangle className="size-5" />
                </span>
                <CardTitle className="tracking-tight">Forensic verdict: backend is paused, not callable</CardTitle>
              </div>
              <CardDescription className="max-w-3xl">
                All 8 candidate paths answered the same platform error. Without admin
                access the deployment cannot be resumed from here, so Phases B and C
                completed in documentation-only mode — honestly, with zero rows
                claimed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-100">
{`> POST ${RESCUE.deployment}/api/query  {"path":"queries:getLatestProject","args":{}}
< 200 (status=error) [Request ID: ${RESCUE.requestIdSample}]

${RESCUE.pausedError}`}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Badge variant="destructive">0/8 paths callable</Badge>
                <Badge variant="secondary">0 rows captured</Badge>
                <Badge variant="secondary">0 unsafe calls made</Badge>
                <Badge variant="outline">resume candidates probed: {RESCUE.resumeCandidates.length}</Badge>
              </div>
            </CardContent>
          </Card>
        </motion.section>

        {/* Phases */}
        <section className="pb-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">The four-phase protocol</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Strict read-only discipline until the designated safe-resume call.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PHASES.map((p, i) => (
              <motion.div key={p.tag} variants={fadeUp} custom={6 + i}>
                <Card className="card-layer h-full">
                  <CardHeader className="pb-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 font-mono text-sm font-bold text-primary">
                      {p.tag}
                    </span>
                    <CardTitle className="mt-3 text-base tracking-tight">{p.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-6 text-muted-foreground">{p.body}</CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Guardrails */}
        <section className="pb-20">
          <div className="grid gap-4 lg:grid-cols-3">
            <motion.div variants={fadeUp} custom={10}>
              <Card className="card-layer h-full">
                <CardHeader className="pb-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ShieldCheck className="size-5" />
                  </span>
                  <CardTitle className="mt-3 text-base tracking-tight">Guardrailed by code</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  The shared client refuses forbidden paths (deleteProject,
                  deleteChunksForLang, deleteHistory, any status-changing update)
                  and allows mutations only for the designated resumeServerProject
                  entry points.
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={fadeUp} custom={11}>
              <Card className="card-layer h-full">
                <CardHeader className="pb-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Database className="size-5" />
                  </span>
                  <CardTitle className="mt-3 text-base tracking-tight">Honest backup</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  This run captured 0 rows — and the artifacts say so plainly.{" "}
                  <code className="font-mono text-xs">rescue/backup-summary.md</code>{" "}
                  records the paused-deployment blocker with the verbatim request ID.
                  When the backend resumes, one command re-runs the full dump.
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={fadeUp} custom={12}>
              <Card className="card-layer h-full">
                <CardHeader className="pb-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Terminal className="size-5" />
                  </span>
                  <CardTitle className="mt-3 text-base tracking-tight">One command to retry</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-5 text-foreground">
npm run rescue
                  </pre>
                  Re-runs phases A → D, regenerating the log, backup, and report
                  from live responses the moment the deployment is resumed.
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>

        {/* Final CTA */}
        <motion.section variants={fadeUp} custom={13} className="pb-24">
          <Card className="card-layer relative overflow-hidden">
            <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-primary/10 blur-3xl" aria-hidden />
            <CardContent className="flex flex-col items-start gap-5 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
              <div>
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                  The 672-page Urdu job is still frozen at 14/92
                </h2>
                <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
                  Review the phase-by-phase evidence in mission control, then resume
                  the pipeline once the old source arrives via GitHub/support.
                </p>
              </div>
              <Button asChild size="lg" className="shrink-0 cursor-pointer">
                <Link to={primaryHref}>
                  {primaryLabel}
                  <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </motion.section>
      </main>

      <footer className="relative z-10 border-t border-border/60 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <span>OnyxTranslate Rescue Mission · read-only by design</span>
          <span>
            Old site:{" "}
            <a className="underline underline-offset-2 hover:text-foreground" href={RESCUE.liveSite} target="_blank" rel="noreferrer">
              oyxtranslate.freebuff.app
            </a>
          </span>
        </div>
      </footer>
    </motion.div>
  );
}
