import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Database,
  ExternalLink,
  FileJson,
  FileText,
  ListChecks,
  PauseCircle,
  ShieldCheck,
  Terminal,
  XCircle,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
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
import { RESCUE, type RescueLatest, type PathStatus } from "@/lib/rescue-facts";

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: i * 0.05, ease: "easeOut" as const },
  }),
};

const PHASE_META = [
  {
    key: "A" as const,
    title: "Read-only forensics",
    desc: "8 candidate paths probed via POST /api/query — responses and errors logged verbatim.",
  },
  {
    key: "B" as const,
    title: "Full data backup",
    desc: "All projects, translations, chunks dumped to a timestamped JSON + markdown summary.",
  },
  {
    key: "C" as const,
    title: "Safe-resume attempt",
    desc: "Designated resumeServerProject mutations only; poll 3× after any invocation.",
  },
  {
    key: "D" as const,
    title: "Report",
    desc: "rescue/report.html generated and mirrored into public/docs/.",
  },
];

const GUARDRAILS = [
  "deleteProject — forbidden forever",
  "deleteChunksForLang — forbidden forever",
  "deleteHistory — forbidden forever",
  "any status-changing update mutation — forbidden",
  "mutations allowed ONLY for designated resumeServerProject entry points",
];

function PhaseIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="size-4" />
    </span>
  ) : (
    <span className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
      <PauseCircle className="size-4" />
    </span>
  );
}

function StatusDot({ status }: { status: PathStatus }) {
  if (status === "ok") {
    return (
      <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" variant="secondary">
        <CheckCircle2 className="size-3" /> OK
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge className="gap-1 bg-red-500/15 text-red-700 dark:text-red-300" variant="secondary">
        <XCircle className="size-3" /> error
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Ban className="size-3" /> unknown
    </Badge>
  );
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [latest, setLatest] = useState<RescueLatest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/rescue/latest.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<RescueLatest>;
      })
      .then((data) => {
        if (alive) setLatest(data);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const counts = latest?.phases?.B?.counts ?? RESCUE.counts;
  const backupFile = latest?.phases?.B?.backupFile ?? RESCUE.backupFile;
  const generatedAt = latest?.generatedAt;
  const nextStep =
    latest?.nextStep ??
    "Once the old source arrives via GitHub/support recovery, import rescue/onyx-backup-*.json into a fresh Convex deployment and resume the Urdu job under controlled code.";

  const pathEntries = Object.entries(
    latest?.phases?.A?.workingPaths ?? Object.fromEntries(RESCUE.probedPaths.map((p) => [p.replace(/ \{.*\}$/, ""), "error" as PathStatus])),
  );

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 grid-backdrop" aria-hidden />

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </span>
            <span className="text-sm font-bold tracking-tight">OnyxTranslate Rescue</span>
          </Link>
          <div className="flex items-center gap-2">
            <a
              href="/docs/rescue-report.html"
              target="_blank"
              rel="noreferrer"
              className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Report
            </a>
            <Button variant="outline" size="sm" className="cursor-pointer" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        {/* Heading */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
          <p className="text-sm font-medium text-muted-foreground">
            Mission control · signed in{user?.email ? ` as ${user.email}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Rescue status</h1>
            {generatedAt && (
              <Badge variant="outline" className="font-mono text-[11px] text-muted-foreground">
                snapshot {new Date(generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC
              </Badge>
            )}
          </div>
        </motion.div>

        {/* Verdict alert */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1} className="mt-6">
          <Card className="card-layer border-destructive/25">
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:gap-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <AlertTriangle className="size-5" />
              </span>
              <div className="space-y-1.5">
                <p className="font-semibold tracking-tight">
                  Blocker: old deployment is paused — data recovery blocked without admin resume
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Every function call on{" "}
                  <code className="rounded bg-muted px-1 font-mono text-xs">{RESCUE.deployment}</code>{" "}
                  returns the same platform error, so no data can be read or backed up from here.
                  The safe-resume probe was also answered with the paused error — Phase C stopped
                  by design, with zero unsafe calls made.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Phase cards */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2} className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">Phases</h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Activity className="size-3.5" /> evidence in rescue/forensic-log.md
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PHASE_META.map((p) => {
              const phases = latest?.phases;
              const ok =
                p.key === "A"
                  ? phases?.A?.completed === true
                  : p.key === "B"
                    ? phases?.B?.completed === true
                    : p.key === "C"
                      ? phases?.C?.completed === true
                      : true; // D is generated with the app snapshot
              return (
                <Card key={p.key} className="card-layer">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 font-mono text-sm font-bold text-primary">
                        {p.key}
                      </span>
                      <PhaseIcon ok={ok} />
                    </div>
                    <CardTitle className="mt-3 text-base tracking-tight">{p.title}</CardTitle>
                    <CardDescription className="text-xs leading-5">{p.desc}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs leading-5 text-muted-foreground">
                    {p.key === "B" && (
                      <span>
                        Rows: {counts.projects} projects · {counts.translations} translations ·{" "}
                        {counts.chunks} chunks · {counts.imageTranslations} imageTranslations
                      </span>
                    )}
                    {p.key === "C" && (
                      <span>
                        {latest?.phases?.C?.stopped
                          ? "Stopped by design — no safe entry point accepted an invocation."
                          : latest?.phases?.C?.resumeInvoked
                            ? `Resume invoked; ${latest?.phases?.C?.polls ?? 0} progress polls recorded.`
                            : "Awaiting run."}
                      </span>
                    )}
                    {p.key === "A" && (
                      <span>{Object.keys(phases?.A?.workingPaths ?? {}).length || 8} paths probed</span>
                    )}
                    {p.key === "D" && <span>report.html + public/docs mirror written</span>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </motion.div>

        {/* Working paths evidence */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3} className="mt-8 grid gap-4 lg:grid-cols-5">
          <Card className="card-layer lg:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-base tracking-tight">Phase A — probed function paths</CardTitle>
              <CardDescription>
                Every probe returned the paused-deployment platform error (status 200, status=error).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">Function path</th>
                      <th className="pb-2 pr-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pathEntries.map(([p, status]) => (
                      <tr key={p} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-3 font-mono text-xs">{p}</td>
                        <td className="py-2 pr-3">
                          <StatusDot status={(status as PathStatus) ?? "unknown"} />
                        </td>
                      </tr>
                    ))}
              </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Verbatim error */}
          <Card className="card-layer lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base tracking-tight">Verbatim blocker</CardTitle>
              <CardDescription>
                Sample request ID <span className="font-mono">{RESCUE.requestIdSample}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3.5 font-mono text-[11px] leading-5 text-zinc-100">
{`POST /api/query {"path":"queries:getLatestProject","args":{}}
→ 200 (status=error) [Request ID: ${RESCUE.requestIdSample}]

${RESCUE.pausedError}`}
              </pre>
              <p className="text-xs leading-5 text-muted-foreground">
                Identical error for all 8 candidate paths and all 7 resume-mutation
                probes — recorded in{" "}
                <code className="font-mono">rescue/forensic-log.md</code> with timestamps.
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Backup + frozen job */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4} className="mt-8 grid gap-4 lg:grid-cols-2">
          <Card className="card-layer">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Database className="size-5" />
                </span>
                <CardTitle className="text-base tracking-tight">Backup (Phase B)</CardTitle>
              </div>
              <CardDescription>
                File <span className="font-mono text-xs">{backupFile}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["projects", counts.projects],
                  ["translations", counts.translations],
                  ["chunks", counts.chunks],
                  ["img. trans.", counts.imageTranslations],
                ].map(([label, n]) => (
                  <div key={label} className="rounded-xl border border-border/70 bg-secondary/40 p-3 text-center">
                    <div className="text-2xl font-bold tracking-tight">{n}</div>
                    <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Honest empty dump: the JSON preserves the run's structure and the
                verbatim blocker, but 0 rows — no progress was recoverable while the
                deployment is paused. Re-run <span className="font-mono">npm run rescue</span>{" "}
                after an admin resumes the deployment.
              </p>
            </CardContent>
          </Card>

          <Card className="card-layer">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileJson className="size-5" />
                </span>
                <CardTitle className="text-base tracking-tight">Frozen job — {RESCUE.frozenJob.label}</CardTitle>
              </div>
              <CardDescription>
                Progress at freeze: <span className="font-semibold text-foreground">{RESCUE.frozenJob.progress}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>completedChunks / totalChunks</span>
                  <span className="font-mono">14 / 92</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-full rounded-full bg-primary/70"
                    initial={{ width: 0 }}
                    animate={{ width: `${(14 / 92) * 100}%` }}
                    transition={{ duration: 0.9, delay: 0.3, ease: "easeOut" }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl border border-border/70 bg-secondary/40 p-3">
                  <div className="text-lg font-bold tracking-tight">
                    {latest?.phases?.C?.completedBefore ?? "—"}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">chunks before</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-secondary/40 p-3">
                  <div className="text-lg font-bold tracking-tight">
                    {latest?.phases?.C?.completedAfter ?? "—"}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">chunks after</div>
                </div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                before/after comes from the 3× polls after a safe-resume invocation.
                None occurred this run — the deployment answered every probe with the
                paused error.
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Guardrails + artifacts + next step */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5} className="mt-8 grid gap-4 lg:grid-cols-3">
          <Card className="card-layer">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Ban className="size-5" />
                </span>
                <CardTitle className="text-base tracking-tight">Guardrails (enforced in code)</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {GUARDRAILS.map((g) => (
                  <li key={g} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span className="font-mono">{g}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="card-layer">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="size-5" />
                </span>
                <CardTitle className="text-base tracking-tight">Artifacts on disk</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {[
                ["rescue/forensic-log.md", "verbatim responses + errors, timestamped"],
                ["rescue/onyx-backup-*.json", "full data dump (structure + blocker)"],
                ["rescue/backup-summary.md", "row counts + frozen-job state"],
                ["rescue/report.html", "full mission report"],
              ].map(([f, d]) => (
                <div key={f} className="flex items-start justify-between gap-3 border-b border-border/40 pb-2.5 last:border-0 last:pb-0">
                  <span className="font-mono text-xs">{f}</span>
                  <span className="text-right text-[11px] leading-4 text-muted-foreground">{d}</span>
                </div>
              ))}
              <Button asChild variant="outline" size="sm" className="mt-1 w-full cursor-pointer">
                <a href="/docs/rescue-report.html" target="_blank" rel="noreferrer">
                  Open report <ExternalLink className="ml-1.5 size-3.5" />
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="card-layer">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ListChecks className="size-5" />
                </span>
                <CardTitle className="text-base tracking-tight">Recommended next step</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs leading-5 text-muted-foreground">{nextStep}</p>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[11px] leading-5 text-foreground">
npm run rescue
              </pre>
              <p className="flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
                <Terminal className="mt-0.5 size-3.5 shrink-0 text-primary" />
                Re-runs A → D read-only; regenerates every artifact from live responses.
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Footer strip */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={6} className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-6 pb-4 text-xs text-muted-foreground">
          <span>
            Target <span className="font-mono">{RESCUE.deployment}</span> · read-only by design
          </span>
          <Link to="/" className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary">
            Back to briefing <ArrowRight className="size-3.5" />
          </Link>
        </motion.div>
      </main>
    </div>
  );
}
