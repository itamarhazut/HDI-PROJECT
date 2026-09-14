import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customerSchema, type CustomerInput } from "@repo/shared";
import { Button, cn, Input, Modal, useToast } from "@repo/ui";
import { FormField } from "./FormField";
import { IconChevronDown } from "./icons";
import { getErrorMessage } from "../lib/errors";
import { supabase } from "../lib/supabase";

interface QuickAddCustomerModalProps {
  onClose: () => void;
  /** Called with the new customer's id once it's been created. */
  onCreated: (customerId: string) => void;
}

// A minimal "add a customer" form in a modal — for when you're in the
// middle of building a quote (or another document) and the customer you
// need doesn't exist yet. Avoids losing the in-progress form by forcing a
// trip to the Customers page and back.
//
// Short by default (just name + phone); "+ פרטים נוספים" reveals the rest
// (billing/document name, business number, mobile, address, city, email) —
// all optional, nothing there is required to create the customer.
export function QuickAddCustomerModal({ onClose, onCreated }: QuickAddCustomerModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [expanded, setExpanded] = React.useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "",
      document_name: "",
      business_id: "",
      phone: "",
      mobile_phone: "",
      email: "",
      address: "",
      city: "",
    },
  });

  const create = useMutation({
    mutationFn: async (values: CustomerInput) => {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          name: values.name,
          document_name: values.document_name || null,
          business_id: values.business_id || null,
          phone: values.phone || null,
          mobile_phone: values.mobile_phone || null,
          email: values.email || null,
          address: values.address || null,
          city: values.city || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "הלקוח נוצר בהצלחה", variant: "success" });
      onCreated(id);
    },
    onError: (err) =>
      toast({ title: "יצירת הלקוח נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  return (
    <Modal open onClose={onClose} title="לקוח חדש" maxWidthClassName="max-w-md">
      <form onSubmit={handleSubmit((values) => create.mutate(values))} className="flex flex-col gap-4">
        <FormField label="שם מלא" htmlFor="qa-name" error={errors.name?.message}>
          <Input id="qa-name" {...register("name")} autoFocus />
        </FormField>
        <FormField label="מספר טלפון" htmlFor="qa-phone" error={errors.phone?.message}>
          <Input id="qa-phone" {...register("phone")} />
        </FormField>

        <div className="-mx-1 border-t border-border pt-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={expanded}
          >
            <span>פרטים נוספים (אופציונלי)</span>
            <IconChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", expanded && "rotate-180")} />
          </button>

          {expanded && (
            <div className="flex flex-col gap-4 pt-2">
              <FormField label="שם עם המסמך" htmlFor="qa-document-name" error={errors.document_name?.message}>
                <Input id="qa-document-name" {...register("document_name")} placeholder="לדוגמה: שם החברה, אם שונה משם הלקוח" />
              </FormField>
              <FormField label="מספר עוסק או ח.פ" htmlFor="qa-business-id" error={errors.business_id?.message}>
                <Input id="qa-business-id" {...register("business_id")} />
              </FormField>
              <FormField label="טלפון נייד" htmlFor="qa-mobile-phone" error={errors.mobile_phone?.message}>
                <Input id="qa-mobile-phone" {...register("mobile_phone")} />
              </FormField>
              <FormField label="כתובת" htmlFor="qa-address" error={errors.address?.message}>
                <Input id="qa-address" {...register("address")} />
              </FormField>
              <FormField label="ישוב" htmlFor="qa-city" error={errors.city?.message}>
                <Input id="qa-city" {...register("city")} />
              </FormField>
              <FormField label="כתובת מייל" htmlFor="qa-email" error={errors.email?.message}>
                <Input id="qa-email" type="email" {...register("email")} />
              </FormField>
            </div>
          )}
        </div>
        {create.error && (
          <p className="text-sm text-destructive">{create.error instanceof Error ? create.error.message : ""}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit" disabled={create.isPending}>
            צור לקוח
          </Button>
        </div>
      </form>
    </Modal>
  );
}
