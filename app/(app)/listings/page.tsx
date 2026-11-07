"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { ListingForm, type EditableListing } from "@/components/listing-form";
import { Badge, EmptyState, ErrorNote, LoadingRows, Modal, PageHeader, useAction } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { categoryLabel, conditionLabel } from "@/lib/format";

type FormState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; listing: EditableListing };

export default function ListingsPage() {
  const listings = useQuery(api.tools.listMine);
  const remove = useMutation(api.tools.remove);
  const [form, setForm] = useState<FormState>({ mode: "closed" });
  const { busy, error, run } = useAction();

  const close = () => setForm({ mode: "closed" });

  return (
    <>
      <PageHeader
        title="My listings"
        intro="Tools you're happy to lend."
        action={
          <button type="button" className="btn btn-primary" onClick={() => setForm({ mode: "create" })}>
            List a tool
          </button>
        }
      />

      <div className="mb-4">
        <ErrorNote message={error} />
      </div>

      {listings === undefined ? (
        <LoadingRows />
      ) : listings.length === 0 ? (
        <EmptyState title="You haven't listed anything yet">
          That ladder in the shed could make someone&apos;s weekend.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {listings.map((listing) => (
            <li key={listing.id} className="card flex flex-wrap items-start justify-between gap-4 p-4">
              <div className="min-w-0 flex-1 basis-64">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg font-semibold">{listing.name}</h2>
                  {listing.availability === "available" ? (
                    <Badge tone="brand">Available</Badge>
                  ) : (
                    <Badge tone="amber">On loan</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {categoryLabel(listing.category)} · {conditionLabel(listing.condition)}
                </p>
                <p className="mt-2 text-sm">{listing.description}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn" onClick={() => setForm({ mode: "edit", listing })}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Remove "${listing.name}"? Open requests will be declined.`)) {
                      void run(() => remove({ toolId: listing.id }));
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        title={form.mode === "edit" ? "Edit listing" : "List a tool"}
        open={form.mode !== "closed"}
        onClose={close}
      >
        {form.mode !== "closed" && (
          <ListingForm listing={form.mode === "edit" ? form.listing : undefined} onDone={close} />
        )}
      </Modal>
    </>
  );
}
