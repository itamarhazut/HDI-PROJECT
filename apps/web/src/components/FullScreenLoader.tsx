import { LogoMark } from "./Logo";
import { Spinner } from "./Spinner";

// Shown while the session/profile is resolving — on first load and right
// after sign-in. Branded rather than a bare "טוען..." string since every
// visit to the app passes through this screen, if only for a moment.
export function FullScreenLoader() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-sidebar">
      <LogoMark className="h-12 w-12" />
      <Spinner className="text-sidebar-foreground/60" />
    </div>
  );
}
