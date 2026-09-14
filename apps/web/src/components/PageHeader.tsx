import * as React from "react";
import type { ComponentType, SVGProps } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Icon shown in a colored badge next to the title — same icon/color as this page's sidebar entry, for a consistent identity throughout the app. */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** Tailwind background color class for the icon badge, e.g. "bg-teal-500". */
  color?: string;
  /**
   * Use a real logo image instead of the colored icon/badge — for a
   * third-party company's actual mark (e.g. Israel Electric Corporation),
   * which is a real trademark we display as-is rather than redraw as a
   * mono icon. Takes priority over icon/color when set.
   */
  logoSrc?: string;
  /** Accessible label for the logo image (defaults to the page title). */
  logoAlt?: string;
}

export function PageHeader({ title, description, action, icon: Icon, color, logoSrc, logoAlt }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {logoSrc ? (
          <span className="flex h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border">
            <img src={logoSrc} alt={logoAlt ?? title} className="h-full w-full object-cover" />
          </span>
        ) : (
          Icon && (
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color ?? "bg-primary"}`}>
              <Icon className="h-5 w-5 text-white" />
            </span>
          )
        )}
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
