// Supabase Storage keys must be plain ASCII — a Hebrew (or any non-Latin)
// file name, completely normal for this app's Hebrew-speaking users,
// gets rejected outright by the storage backend with an "Invalid key"
// error the moment it's used as (part of) the upload path.
//
// Every place in this app that uploads a file builds its storage path from
// the original file name (see ResourceCategoryDetailPage's uploadFile/
// uploadSlotFile and DocumentsPage's upsert) — this helper makes that path
// safe while leaving the ORIGINAL name untouched wherever it's stored for
// display (resource_files.file_name, documents.title, etc.). Nothing about
// what the user sees changes; only the internal Storage key does.
const COMBINING_DIACRITICS = /[\u0300-\u036f]/g;

export function safeStorageFileName(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  const hasExt = dotIndex > 0 && dotIndex < name.length - 1;
  const ext = hasExt
    ? name
        .slice(dotIndex)
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, "")
    : "";
  const base = hasExt ? name.slice(0, dotIndex) : name;
  const safeBase = base
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "") // strip Latin accents (café → cafe)
    .replace(/[^a-zA-Z0-9_-]+/g, "-") // everything else (Hebrew, spaces, ...) → "-"
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return (safeBase || "file") + ext;
}
