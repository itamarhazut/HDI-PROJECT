# הקמה — מה צריך לעשות כדי להריץ את המערכת בפועל

מסמך זה מפרט את הצעדים שאיתמר צריך לבצע (לא Claude) כדי לחבר את השלד לשירותים
אמיתיים. עד שהצעדים האלה לא בוצעו, `apps/web` עדיין רץ ומציג את המסכים, אבל
כניסה/הרשמה לא באמת תעבוד (יוצג באנר "Supabase עדיין לא מחובר").

## 1. פרויקט Supabase

1. הרשמה חינמית ב-https://supabase.com
2. יצירת פרויקט חדש (מומלץ אזור באירופה לקרבה לישראל).
3. ב-Project Settings → API: להעתיק את **Project URL** ואת **anon public key**.
4. ליצור קובץ `apps/web/.env.local` (זה מועתק מ-`.env.example`) ולמלא:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
5. להריץ את המיגרציה הראשונית: ב-Supabase Dashboard → SQL Editor, להדביק את
   התוכן של `supabase/migrations/0001_init.sql` ולהריץ. (בהמשך, כשתתקין את
   ה-CLI של Supabase, אפשר גם `supabase link` + `supabase db push`.)
6. אופציונלי: להריץ גם את `supabase/seed.sql` כדי לקבל כמה פריטי מחירון לדוגמה.
7. **הפיכת המשתמש הראשון למנהל**: להירשם פעם אחת דרך האפליקציה (`/signup`),
   ואז ב-SQL Editor להריץ:
   ```sql
   update public.profiles set role = 'admin' where email = 'האימייל-שלך@example.com';
   ```

## 2. הרצה מקומית

```bash
pnpm install
pnpm dev:web
```
האתר יעלה על http://localhost:5173

## 3. GitHub

יש לך כבר חשבון GitHub. הצעדים:

1. ליצור ריפו חדש וריק ב-GitHub (בלי README/gitignore — זה כבר קיים כאן).
2. להריץ כאן:
   ```bash
   git remote add origin <כתובת-הריפו-שלך>
   git branch -M main
   git add -A
   git commit -m "Phase 0: initial monorepo scaffold"
   git push -u origin main
   ```
   (בסשן העבודה עם Claude נבצע את זה יחד ברגע שתאשר/י את כתובת הריפו.)

## מה עוד יידרש בהמשך (לא עכשיו)

- **שלב 2 (דסקטופ)**: שום דבר נוסף לא נדרש ממך מראש — Electron ייבנה מקומי.
- **שלב 3 (מובייל)**: חשבון Expo (חינמי) כשנגיע לזה.
- **שלב 4 (אתר נחיתה)**: דומיין לעסק (לא חובה בהתחלה — אפשר גם ב-Vercel זמנית).
- **שלב 5 (חשבונית רשמית)**: פרטי גישה ל-API של "יש חשבונית" (אם קיים).
