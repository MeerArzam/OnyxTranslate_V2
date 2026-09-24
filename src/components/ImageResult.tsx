import { useState } from "react";
import { Check, Copy, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getLocalizationConfig } from "@/data/localization";

export function ImageResult({ text, langCode }: { text: string; langCode: string }) {
  const config = getLocalizationConfig(langCode);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text.slice(0, 10000)); toast.success("Copied translation"); }
    catch { const area = document.createElement("textarea"); area.value = text.slice(0, 10000); document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove(); toast.success("Copied translation"); }
  };
  return <div className="rounded-xl border border-emerald-300/20 bg-emerald-950/10 p-4"><div className="flex items-center justify-between gap-2"><p className="flex items-center gap-2 font-semibold"><Check className="size-4 text-emerald-300" />{config?.name ?? langCode} translation</p><Button size="sm" variant="ghost" onClick={copy}><Copy />Copy</Button></div><p dir={config?.rtl ? "rtl" : "ltr"} className="scroll-area mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-sm leading-6">{text}</p><p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><FileText className="size-3" />OCR output · first 10,000 characters are copy-safe</p></div>;
}
