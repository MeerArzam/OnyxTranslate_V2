import { useMemo, useState } from "react";
import { Pause, Play, RotateCcw, Download, FileDown, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { getLocalizationConfig } from "@/data/localization";

type Translation = { _id?: string; langCode: string; status: string; completedChunks: number; totalChunks: number; mergedText?: string; pdfUrl?: string };
type Project = { status: string; pageCount: number; wordCount: number; zipUrl?: string };

export function RoyalProgressPanel({ project, translations, selected, onPause, onResume, onDownloadZip, onDownloadPdf, onRestart }: {
  project: Project | null;
  translations: Translation[];
  selected: string[];
  onPause: () => void;
  onResume: () => void;
  onDownloadZip: () => void;
  onDownloadPdf: (langCode: string, url: string) => void;
  onRestart: () => void;
}) {
  const rows = useMemo(() => selected.map((langCode) => translations.find((t) => t.langCode === langCode) ?? ({ langCode, status: "pending", completedChunks: 0, totalChunks: 0 })), [selected, translations]);
  const total = rows.reduce((sum, row) => sum + row.totalChunks, 0);
  const done = rows.reduce((sum, row) => sum + Math.min(row.completedChunks, row.totalChunks), 0);
  const active = rows.find((row) => row.status === "in_progress" || row.status === "translating") ?? rows.find((row) => row.completedChunks < row.totalChunks);
  const overall = total ? Math.round((done / total) * 100) : 0;
  return <section className="royal-card rounded-2xl p-5 sm:p-6" aria-live="polite">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200">Royal progress</p><h2 className="mt-1 text-xl font-bold">The archive is moving.</h2></div>
      <Badge className="glow-badge border-cyan-200/20 bg-cyan-200/10 text-cyan-100">{project?.status === "complete" || project?.status === "all_translated" ? "Complete" : "Continues in background"}</Badge>
    </div>
    {active && active.totalChunks > 0 && <div className="mt-5 rounded-xl border border-cyan-200/15 bg-cyan-950/20 p-4"><p className="text-sm font-semibold">{getLocalizationConfig(active.langCode)?.name ?? active.langCode} · Chunk {Math.min(active.completedChunks + 1, active.totalChunks)} of {active.totalChunks}</p><Progress value={overall} className="mt-3" /><p className="mt-2 text-xs text-muted-foreground">{done} of {total} chunks complete · browser can close safely</p></div>}
    <div className="mt-5 space-y-2">{rows.map((row) => <LanguageRow key={row.langCode} row={row} onDownloadPdf={onDownloadPdf} />)}</div>
    <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-5">
      {project?.status === "translating" ? <Button variant="outline" className="btn-royal-hover" onClick={onPause}><Pause />Pause</Button> : <Button className="btn-royal-hover" onClick={onResume}><Play />Resume</Button>}
      {project?.zipUrl && <Button variant="outline" className="btn-royal-hover" onClick={onDownloadZip}><Download />Download ZIP</Button>}
      <Button variant="ghost" className="text-muted-foreground" onClick={onRestart}><RotateCcw />Start fresh</Button>
    </div>
  </section>;
}

function LanguageRow({ row, onDownloadPdf }: { row: Translation; onDownloadPdf: (langCode: string, url: string) => void }) {
  const [open, setOpen] = useState(false);
  const config = getLocalizationConfig(row.langCode);
  const complete = row.status === "complete" || row.status === "generating_pdf" || row.completedChunks >= row.totalChunks;
  return <div className="rounded-xl border border-white/10 bg-black/10"><button type="button" className="flex w-full items-center gap-3 p-3 text-left" onClick={() => setOpen(!open)}><span className="text-cyan-200">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span><span className="flex-1"><span className="block font-semibold">{config?.name ?? row.langCode} <span className="text-xs text-muted-foreground">{config?.nativeName}</span></span><span className="text-xs text-muted-foreground">{row.completedChunks}/{row.totalChunks || "—"} chunks · {row.status}</span></span><span className={`h-2 w-2 rounded-full ${complete ? "bg-emerald-300" : "bg-amber-300"}`} /></button>{open && <div className="border-t border-white/10 p-3"><Progress value={row.totalChunks ? (row.completedChunks / row.totalChunks) * 100 : 0} />{row.mergedText && <p dir={config?.rtl ? "rtl" : "ltr"} className="scroll-area mt-3 max-h-40 overflow-auto rounded-lg bg-black/20 p-3 text-sm leading-6">{row.mergedText.slice(0, 10000)}</p>}{row.pdfUrl && <Button size="sm" variant="outline" className="mt-3" onClick={() => onDownloadPdf(row.langCode, row.pdfUrl!)}><FileDown />PDF</Button>}</div>}</div>;
}
