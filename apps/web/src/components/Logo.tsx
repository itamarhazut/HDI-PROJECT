// The app's mark — a navy rounded square with an amber bolt — mirrors
// apps/desktop/resources/icon.ico so the taskbar icon, the installer, and
// the in-app header all show the same identity. Inline SVG (not an <img>)
// so it stays crisp at any size and needs no asset file.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#1e3a8a" />
      <path d="M22 6 15 22h5l-2 12 9-16h-6l2-12Z" fill="#facc15" />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
}

export function Logo({ className, markClassName, wordmarkClassName }: LogoProps) {
  return (
    <div className={className ?? "flex items-center gap-2.5"}>
      <LogoMark className={markClassName ?? "h-9 w-9 shrink-0"} />
      <span className={wordmarkClassName ?? "text-lg font-bold tracking-tight"}>HDI Project</span>
    </div>
  );
}
