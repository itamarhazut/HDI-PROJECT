import { useQuery } from "@tanstack/react-query";
import { DOCUMENT_STATUS_LABELS, strings } from "@repo/shared";
import { Card, CardContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDate } from "../../lib/format";
import { supabase } from "../../lib/supabase";

export function MyDocumentsPage() {
  // RLS (documents_select_own_visible) scopes this to the logged-in
  // customer's own documents that were explicitly marked visible.
  const { data: documents, isLoading } = useQuery({
    queryKey: ["my-documents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const download = async (path: string) => {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60);
    if (error || !data) {
      alert("שגיאה בפתיחת הקובץ: " + (error?.message ?? "לא נמצא"));
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={strings.nav.myDocuments} description="מסמכים ואישורים שהעסק שיתף איתך." />
      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <p className="text-muted-foreground">{strings.common.loading}</p>
          ) : (documents ?? []).length === 0 ? (
            <p className="text-muted-foreground">{strings.common.noResults}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>כותרת</TableHead>
                  <TableHead>{strings.common.status}</TableHead>
                  <TableHead>יעד</TableHead>
                  <TableHead>קובץ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(documents ?? []).map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status} label={DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status} />
                    </TableCell>
                    <TableCell>{formatDate(doc.due_date)}</TableCell>
                    <TableCell>
                      {doc.file_path ? (
                        <button className="text-primary underline" onClick={() => void download(doc.file_path as string)}>
                          הורדה
                        </button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
