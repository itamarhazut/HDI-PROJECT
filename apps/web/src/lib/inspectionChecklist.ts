import type { ChecklistQuestion } from "@repo/shared";

export interface ChecklistItem {
  key: string;
  label: string;
  /** When true, this item gets an inline calculation sub-panel (currently
   * just the grounding loop-impedance item), in addition to the usual
   * תקין/לא תקין buttons — see maxAllowedLoopImpedance below. Its status
   * is set automatically from the calc, but can still be overridden by
   * hand with those buttons. */
  hasCalc?: boolean;
  /** When true, this item gets a small "value + unit (kΩ/MΩ)" field to
   * record the insulation-resistance reading — see InsulationCalcState
   * below. Just record-keeping alongside the usual ✓/✗ buttons, no
   * automatic pass/fail like hasCalc above. */
  hasInsulationMeasurement?: boolean;
}

export interface ChecklistSection {
  title: string;
  items: ChecklistItem[];
}

// The checklist's questions used to be a hardcoded constant here. They're
// now editable/deletable from the "בדיקות" UI (the pencil icon next to
// each question), so the real list lives in the `checklist_questions`
// table instead — this just groups the rows fetched from there back into
// the same {title, items} shape the page renders, preserving section
// grouping. Assumes `questions` arrives sorted by sort_order (so each
// section's rows are contiguous) — true as long as sections aren't
// interleaved, which nothing in this app currently does.
export function groupChecklistQuestions(questions: ChecklistQuestion[]): ChecklistSection[] {
  const sections: ChecklistSection[] = [];
  for (const q of questions) {
    const item: ChecklistItem = {
      key: q.id,
      label: q.label,
      hasCalc: q.has_calc,
      hasInsulationMeasurement: q.has_insulation_measurement,
    };
    const last = sections[sections.length - 1];
    if (last && last.title === q.section_title) {
      last.items.push(item);
    } else {
      sections.push({ title: q.section_title, items: [item] });
    }
  }
  return sections;
}

// --- "גודל חיבור" — phase + a generic list of standard connection sizes,
// combined into a label like "1x25A" / "3x63A", instead of free text. ---
export const CONNECTION_PHASE_OPTIONS = [
  { value: "1", label: "חד פאזי" },
  { value: "3", label: "תלת פאזי" },
] as const;

export const CONNECTION_AMPS_OPTIONS = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630];

export function formatConnectionSize(
  phase: string | null | undefined,
  amps: number | null | undefined
): string | null {
  if (!phase || !amps) return null;
  return `${phase}x${amps}A`;
}

// --- The grounding Zs (loop impedance) calc — its own small blob per
// inspection (Inspection.grounding_calc). Voltage is always 230V (חברת
// חשמל's standard low-voltage supply) so it's not a field here — just a
// constant baked into the formula. `panel_material` decides whether the
// main breaker counts toward "the highest breaker rating in the panel":
// on a plastic (non-conductive) board the main is excluded, on a metal one
// it's included. ---
export type PanelMaterial = "plastic" | "metal";

export const PANEL_MATERIAL_OPTIONS: { value: PanelMaterial; label: string }[] = [
  { value: "plastic", label: "פלסטיק" },
  { value: "metal", label: "מתכת" },
];

export const GROUNDING_SUPPLY_VOLTAGE = 230;

// `type`, not `interface` — this gets written into Inspection.grounding_calc
// (typed as Record<string, unknown>), and only an object type *literal*
// structurally satisfies that; an interface never does, even with
// identical properties (same pitfall as Database in database.ts).
export type GroundingCalcState = {
  panel_material?: PanelMaterial;
  breaker_rating?: number;
  measured_value?: number;
};

export function breakerRatingLabel(panelMaterial: PanelMaterial | undefined): string {
  return `מא"ז הגבוה ביותר בלוח (${panelMaterial === "metal" ? "כולל הראשי" : "אחרי הראשי"})`;
}

// חברת חשמל דורשת שזרם התקלה יהיה גבוה פי 10 לפחות מזרם ההגנה (מא"ז), כדי
// להבטיח ניתוק מהיר במקרה של תקלה — כלומר עכבת לולאת התקלה (Zs) הנמדדת
// חייבת להיות נמוכה או שווה לערך המקסימלי המחושב כאן.
export function maxAllowedLoopImpedance(voltage: number | undefined, breakerRating: number | undefined): number | null {
  if (!voltage || !breakerRating) return null;
  return voltage / (10 * breakerRating);
}

// --- The insulation-resistance reading for "ערכי הבידוד שנמדדו..." — just
// a value + which unit it was read in (megohmmeters commonly show kΩ or
// MΩ depending on range), stored on its own (Inspection.insulation_calc).
// No pass/fail threshold here, unlike the grounding calc above — the
// question's own ✓/✗ buttons stay manual. ---
export type InsulationUnit = "kohm" | "mohm";

export const INSULATION_UNIT_OPTIONS: { value: InsulationUnit; label: string }[] = [
  { value: "kohm", label: "קילו-אום (kΩ)" },
  { value: "mohm", label: "מגה-אום (MΩ)" },
];

// `type`, not `interface` — same reason as GroundingCalcState above.
export type InsulationCalcState = {
  measured_value?: number;
  unit?: InsulationUnit;
};

// "תאריך יעד לבדיקה הבאה" — מחושב, לא נשמר בנפרד.
export function nextInspectionDueDate(inspectionDate: string | undefined, frequencyYears: number | undefined): Date | null {
  if (!inspectionDate || !frequencyYears) return null;
  const base = new Date(inspectionDate);
  if (Number.isNaN(base.getTime())) return null;
  base.setFullYear(base.getFullYear() + frequencyYears);
  return base;
}
