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

export const DEFAULT_VAT_RATE = 0.17;
