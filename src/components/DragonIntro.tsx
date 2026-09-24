import { useEffect, useState } from "react";
import logo from "@/assets/logo.svg";

export function DragonIntro() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 3500);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#080b18]/95" aria-label="OnyxTranslate loading">
      <div className="relative flex flex-col items-center gap-4 overflow-hidden px-6 text-center">
        <div className="absolute inset-y-0 w-24 royal-flash bg-cyan-200/10 blur-2xl" />
        <img src={logo} alt="OnyxTranslate" className="relative h-24 w-24 drop-shadow-[0_0_24px_rgba(98,245,238,.65)]" />
        <p className="logo-gradient relative text-3xl font-black tracking-[.18em] sm:text-5xl">ONYX</p>
        <p className="relative text-xs font-semibold uppercase tracking-[.35em] text-cyan-200/80">Translation, with a memory</p>
      </div>
    </div>
  );
}
