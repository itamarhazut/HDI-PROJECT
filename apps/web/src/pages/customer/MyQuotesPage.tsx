import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { QUOTE_STATUS_LABELS, strings } from "@repo/shared";
import { Button, Card, CardContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui";
import { StatusBadge } from "../../components/StatusBadge";
import { PageHeader } from "../../components/PageHeader";
import { formatCurrency, formatDate } from "../../lib/format";
import { supabase } from "../../lib/supabase";

export function MyQuotesPage() {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  // RLS (quotes_select_own) scopes this to the logged-in customer's own quotes.
  const { data: quotes, isLoading } = useQuery({
    queryKey: ["my-quotes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: lineItems } = useQuery({
    queryKey: ["my-quote-line-items", expanded],
    enabled: expanded !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_line_items")
        .select("*")
        .eq("quote_id", expanded as string)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={strings.nav.myQuotes} description="הצעות המחיר שקיבלת — לחצ/י על שורה לפירוט." />
      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <p className="text-muted-foreground">{strings.common.loading}</p>
          ) : (quotes ?? []).length === 0 ? (
            <p className="text-muted-foreground">{strings.common.noResults}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>מס׳</TableHead>
                  <TableHead>{strings.common.status}</TableHead>
                  <TableHead>{strings.common.total}</TableHead>
                  <TableHead>בתוקף עד</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(quotes ?? []).map((q) => (
                  <React.Fragment key={q.id}>
                    <TableRow>
                      <TableCell>#{q.quote_number}</TableCell>
                      <TableCell>
                        <StatusBadge status={q.status} label={QUOTE_STATUS_LABELS[q.status] ?? q.status} />
                      </TableCell>
                      <TableCell>{formatCurrency(q.total)}</TableCell>
                      <TableCell>{formatDate(q.valid_until)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => setExpanded((c) => (c === q.id ? null : q.id))}>
                            {expanded === q.id ? "סגירה" : "פירוט"}
                          </Button>
                          <Link to={`/portal/quotes/${q.id}/print`} target="_blank" rel="noreferrer">
                            <Button variant="outline" size="sm">
                              PDF / הדפסה
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded === q.id && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/30">
                          <div className="flex flex-col gap-2 p-2">
                            {(lineItems ?? []).map((li) => (
                              <div key={li.id} className="flex items-center justify-between text-sm">
                                <span>
                                  {li.description} × {li.quantity}
                                </span>
                                <span>{formatCurrency(li.line_total)}</span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between border-t pt-2 text-sm text-muted-foreground">
                              <span>מע״מ</span>
                              <span>{formatCurrency(q.tax_amount)}</span>
                            </div>
                            {q.notes && <p className="text-sm text-muted-foreground">הערות: {q.notes}</p>}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
