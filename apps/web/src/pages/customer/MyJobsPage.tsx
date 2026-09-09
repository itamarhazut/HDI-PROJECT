import { useQuery } from "@tanstack/react-query";
import { JOB_STATUS_LABELS, strings } from "@repo/shared";
import { Card, CardContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDate } from "../../lib/format";
import { supabase } from "../../lib/supabase";

export function MyJobsPage() {
  // RLS (jobs_select_own) scopes this to the logged-in customer's own jobs.
  const { data: jobs, isLoading } = useQuery({
    queryKey: ["my-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={strings.nav.myJobs} description="התקדמות העבודות שביצענו עבורך." />
      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <p className="text-muted-foreground">{strings.common.loading}</p>
          ) : (jobs ?? []).length === 0 ? (
            <p className="text-muted-foreground">{strings.common.noResults}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>כותרת</TableHead>
                  <TableHead>{strings.common.status}</TableHead>
                  <TableHead>כתובת</TableHead>
                  <TableHead>תאריך מתוזמן</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(jobs ?? []).map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-medium">{j.title}</TableCell>
                    <TableCell>
                      <StatusBadge status={j.status} label={JOB_STATUS_LABELS[j.status] ?? j.status} />
                    </TableCell>
                    <TableCell>{j.address ?? "—"}</TableCell>
                    <TableCell>{formatDate(j.scheduled_date)}</TableCell>
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
