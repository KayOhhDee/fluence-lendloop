"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { BoxIcon, CategoryTile, PlusIcon } from "@/components/icons";
import { ListingForm, type EditableListing } from "@/components/listing-form";
import { AvailabilityBadge, EmptyState, LoadingRows, Modal, PageHeader, useConfirm } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { categoryLabel, conditionLabel } from "@/lib/format";

type FormState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; listing: EditableListing };

export default function ListingsPage() {
  const listings = useQuery(api.tools.listMine);
  const remove = useMutation(api.tools.remove);
  const [form, setForm] = useState<FormState>({ mode: "closed" });
  const { confirm, confirmDialog } = useConfirm();

  const close = () => setForm({ mode: "closed" });
  const openCreate = () => setForm({ mode: "create" });
  const listButton = (
    <button type="button" className="btn btn-primary" onClick={openCreate}>
      <PlusIcon />
      List a tool
    </button>
  );

  return (
    <>
      <PageHeader title="My listings" intro="Tools you're happy to lend." action={listButton} />

      {listings === undefined ? (
        <LoadingRows />
      ) : listings.length === 0 ? (
        <EmptyState title="You haven't listed anything yet" icon={<BoxIcon className="h-6 w-6" />}>
          That ladder in the shed could make someone&apos;s weekend. Use <strong>List a tool</strong> to add it.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {listings.map((listing) => (
            <li key={listing.id} className="card flex flex-wrap items-start justify-between gap-4 p-4">
              <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
                <CategoryTile category={listing.category} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-semibold">{listing.name}</h2>
                    <AvailabilityBadge availability={listing.availability} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {categoryLabel(listing.category)} · {conditionLabel(listing.condition)}
                  </p>
                  <p className="mt-2 text-sm">{listing.description}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn" onClick={() => setForm({ mode: "edit", listing })}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() =>
                    confirm({
                      title: `Remove the ${listing.name}?`,
                      body: "It will leave the board, and any open requests for it will be declined.",
                      confirmLabel: "Remove listing",
                      cancelLabel: "Keep listing",
                      danger: true,
                      action: () => remove({ toolId: listing.id }),
                    })
                  }
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
        closeOnBackdrop={false}
      >
        {form.mode !== "closed" && (
          <ListingForm listing={form.mode === "edit" ? form.listing : undefined} onDone={close} />
        )}
      </Modal>
      {confirmDialog}
    </>
  );
}
