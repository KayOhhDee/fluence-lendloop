"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORIES, CONDITIONS, LIMITS, type Category, type Condition } from "@/convex/lib/domain";
import { ErrorNote, useAction } from "./ui";

export type EditableListing = {
  id: Id<"tools">;
  name: string;
  category: Category;
  condition: Condition;
  description: string;
};

export function ListingForm({ listing, onDone }: { listing?: EditableListing; onDone: () => void }) {
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const { busy, error, run } = useAction();

  const [name, setName] = useState(listing?.name ?? "");
  const [category, setCategory] = useState<Category>(listing?.category ?? "power_tools");
  const [condition, setCondition] = useState<Condition>(listing?.condition ?? "good");
  const [description, setDescription] = useState(listing?.description ?? "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const fields = { name, category, condition, description };
    const saved = await run(() => (listing ? update({ toolId: listing.id, ...fields }) : create(fields)));
    if (saved) onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="tool-name">
          Name
        </label>
        <input
          id="tool-name"
          className="field"
          required
          data-autofocus={listing ? undefined : true}
          placeholder="Cordless drill"
          maxLength={LIMITS.toolName}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="tool-category">
            Category
          </label>
          <select
            id="tool-category"
            className="field"
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
          >
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tool-condition">
            Condition
          </label>
          <select
            id="tool-condition"
            className="field"
            value={condition}
            onChange={(event) => setCondition(event.target.value as Condition)}
          >
            {CONDITIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="tool-description">
          Short description
        </label>
        <textarea
          id="tool-description"
          className="field"
          rows={3}
          required
          placeholder="What it's good for, and anything a borrower should know."
          maxLength={LIMITS.toolDescription}
          aria-describedby="tool-description-count"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <p id="tool-description-count" className="mt-1 text-right text-xs text-muted">
          {description.length} of {LIMITS.toolDescription} characters
        </p>
      </div>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : listing ? "Save changes" : "List tool"}
        </button>
      </div>
    </form>
  );
}
