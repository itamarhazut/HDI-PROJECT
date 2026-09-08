# HDI Project — מערכת ניהול לעסק חשמלאות

מונורפו (pnpm + Turborepo) שמכיל את כל חלקי המערכת: אפליקציית ווב (שגם עוטפים
לדסקטופ), אפליקציית מובייל לשטח, ואתר נחיתה שיווקי — כולם מול אותו שרת/דאטהבייס
משותף (Supabase).

התוכנית המלאה (ארכיטקטורה, שלבים, החלטות) נמצאת ב-`PLAN.md`.

## מבנה הריפו

```
apps/
  web/       # אפליקציית הווב הראשית: פאנל ניהול + פורטל לקוח (React + Vite)
  desktop/   # (שלב 2) עטיפת Electron סביב apps/web — עדיין לא נבנה
  mobile/    # (שלב 3) אפליקציית Expo לשטח — עדיין לא נבנה
  marketing/ # (שלב 4) אתר נחיתה Next.js — עדיין לא נבנה
packages/
  shared/    # לקוח Supabase, טיפוסי DB, סכמות Zod, מחרוזות עברית משותפות
  ui/        # ספריית רכיבי UI משותפת (בסגנון shadcn/ui)
  config/    # קונפיגורציית eslint/tailwind משותפת
supabase/
  migrations/  # SQL — מקור האמת לסכמת הדאטהבייס
  seed.sql     # נתוני דוגמה
```

## מצב נוכחי (שלב 0)

השלד של `apps/web` עובד ונבדק (typecheck + lint + build + dev server) —
כולל ניתוב, הפרדת מנהל/לקוח, מסכי login/signup, ועמוד placeholder לכל מחלקה.
עדיין **אין חיבור אמיתי ל-Supabase** — לשם כך יש לעקוב אחר `SETUP.md`.

CRUD אמיתי בכל מחלקה (לקוחות, מלאי, מחירון, הצעות מחיר, עבודות, חשבוניות,
מסמכים, לידים) הוא שלב 1 (MVP) — עדיין לפנינו.

## הרצה מקומית

ראה `SETUP.md` להוראות מלאות. בקצרה:

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # ולמלא מפתחות Supabase אמיתיים
pnpm dev:web
```
