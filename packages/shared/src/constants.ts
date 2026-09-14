export const JOB_STATUS_LABELS: Record<string, string> = {
  new: "חדש",
  scheduled: "מתוזמן",
  in_progress: "בביצוע",
  completed: "הושלם",
  cancelled: "בוטל",
};

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה",
  sent: "נשלחה",
  accepted: "אושרה",
  rejected: "נדחתה",
  expired: "פגה תוקף",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  pending: "ממתין",
  marked_invoiced: "הופקה חשבונית",
  paid: "שולם",
  overdue: "באיחור",
  cancelled: "בוטל",
};

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  needed: "נדרש",
  in_progress: "בטיפול",
  submitted: "הוגש",
  approved: "אושר",
  rejected: "נדחה",
};

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "חדש",
  contacted: "נוצר קשר",
  converted: "הומר ללקוח",
  lost: "אבוד",
};

export const MARKETING_POST_STATUS_LABELS: Record<string, string> = {
  idea: "רעיון",
  draft: "טיוטה",
  scheduled: "מתוזמן",
  published: "פורסם",
};

export const MARKETING_POST_PLATFORM_LABELS: Record<string, string> = {
  facebook: "פייסבוק",
  instagram: "אינסטגרם",
  other: "אחר",
};

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  materials: "חומרים וציוד",
  fuel_vehicle: "דלק ורכב",
  tools: "כלים וציוד עבודה",
  insurance: "ביטוח",
  marketing: "שיווק ופרסום",
  rent_utilities: "שכירות ותשתית",
  professional_services: "שירותים מקצועיים (רו״ח/עו״ד)",
  other: "אחר",
};

export const EXPENSE_PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "מזומן",
  credit_card: "כרטיס אשראי",
  bank_transfer: "העברה בנקאית",
  check: "צ׳ק",
  other: "אחר",
};

export const DEFAULT_VAT_RATE = 0.18;
