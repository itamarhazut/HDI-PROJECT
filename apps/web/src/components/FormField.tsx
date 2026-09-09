import * as React from "react";
import { Label } from "@repo/ui";

interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

// Thin label+control+error wrapper used by every CRUD form in the app, so
// forms stay consistent without copy-pasting the same three lines per field.
export function FormField({ label, htmlFor, error, children, className }: FormFieldProps) {
  return (
    <div className={className ?? "flex flex-col gap-1.5"}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
