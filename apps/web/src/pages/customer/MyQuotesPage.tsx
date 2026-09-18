import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUOTE_STATUS_LABELS, respondToQuote, strings } from "@repo/shared";
import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  useConfirmDialog,
  useToast,
} from "@repo/ui";
import { StatusBadge } from "../../components/StatusBadge";
import { PageHeader } from "../../components/PageHeader";
import { IconFileText } from "../../components/icons";
import { QuoteViewModal } from "../../components/QuoteViewModal";
import { formatCurrency, formatDate } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase";

export function MyQuotesPage() {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [viewingQuoteId, setViewingQuoteId] = React.useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();

  // RLS (quotes_select_own) scopes this to the logged-in customer's own quotes.
  const { data: quotes, isLoading } = useQuery({
    queryKey: ["my-quotes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Goes through the respond_to_quote RPC rather than a client-side
  // `.update()` — quotes has no customer UPDATE policy at all, and
  // accepting also needs to create the job, which the customer has no
  // INSERT rights on. See 0007_customer_quote_response.sql.
  const respond = useMutation({
    mutationFn: async ({ quoteId, accept }: { quoteId: string; accept: boolean }) => {
      await respondToQuote(supabase, { quoteId, accept });
    },
    onSuccess: (_data, { accept }) => {
      void queryClient.invalidateQueries({ queryKey: ["my-quotes"] });
      toast({ title: accept ? "הצעת המחיר אושרה" : "הצעת המחיר נדחתה", variant: "success" });
    },
    onError: (err) => toast({ title: "השליחה נכשלה", description: getErrorMessage(err), variant: "error" }),
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
      <PageHeader title={strings.nav.myQuotes} description="הצעות המחיר שקיבלת — לחצ/י על שורה לפירוט." icon={IconFileText} color="bg-amber-500" />
      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <TableSkeleton columns={5} />
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
                          <Button variant="outline" size="sm" onClick={() => setViewingQuoteId(q.id)}>
                            צפייה / PDF
                          </Button>
                          {q.status === "sent" && (
                            <>
                              <Button
                                size="sm"
                                disabled={respond.isPending}
                                onClick={async () => {
                                  const ok = await confirmDialog({
                                    title: "אישור הצעת מחיר",
                                    description: `לאשר את הצעת המחיר #${q.quote_number}? לאחר האישור ניצור עבורך את העבודה ונתחיל בטיפול.`,
                                    confirmLabel: "אישור",
                                  });
                                  if (ok) respond.mutate({ quoteId: q.id, accept: true });
                                }}
                              >
                                אישור הצעה
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={respond.isPending}
                                onClick={async () => {
                                  const ok = await confirmDialog({
                                    title: "דחיית הצעת מחיר",
                                    description: `לדחות את הצעת המחיר #${q.quote_number}? ניתן ליצור קשר איתנו אם התכוונת למשהו אחר.`,
                                    confirmLabel: "דחייה",
                                    variant: "destructive",
                                  });
                                  if (ok) respond.mutate({ quoteId: q.id, accept: false });
                                }}
                              >
                                דחיית הצעה
                              </Button>
                            </>
                          )}
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

      {viewingQuoteId && (
        <QuoteViewModal
          quoteId={viewingQuoteId}
          onClose={() => setViewingQuoteId(null)}
          printBasePath="/portal/quotes"
        />
      )}
    </div>
  );
}
