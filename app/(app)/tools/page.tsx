"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { RequestDialog, type RequestableTool } from "@/components/request-dialog";
import { Badge, EmptyState, LoadingRows, PageHeader, TrustedBadge } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { CATEGORIES, type Category } from "@/convex/lib/domain";
import { categoryLabel, conditionLabel, formatRange } from "@/lib/format";

export default function ToolsPage() {
  const [category, setCategory] = useState<Category | undefined>();
  const [requesting, setRequesting] = useState<RequestableTool | null>(null);
  const tools = useQuery(api.tools.list, { category });

  const filters: { value: Category | undefined; label: string }[] = [
    { value: undefined, label: "All" },
    ...CATEGORIES,
  ];

  return (
    <>
      <PageHeader title="All tools" intro="Everything your neighbors are willing to lend." />

      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        {filters.map((filter) => {
          const active = filter.value === category;
          return (
            <button
              key={filter.label}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(filter.value)}
              className={`rounded-full border px-3 py-1 text-sm ${
                active ? "border-ink bg-ink text-white" : "border-line bg-card text-muted hover:text-ink"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {tools === undefined ? (
        <LoadingRows />
      ) : tools.length === 0 ? (
        <EmptyState title="Nothing here yet">
          {category ? "Try another category." : "List the first tool from My listings."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <li key={tool.id} className="card flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-lg font-semibold">{tool.name}</h2>
                {tool.availability === "available" ? (
                  <Badge tone="brand">Available</Badge>
                ) : (
                  <Badge tone="amber">On loan</Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">
                {categoryLabel(tool.category)} · {conditionLabel(tool.condition)}
              </p>
              <p className="mt-3 flex-1 text-sm">{tool.description}</p>
              {tool.bookedRanges.length > 0 && (
                <p className="mt-3 text-xs text-muted">
                  Booked: {tool.bookedRanges.map((range) => formatRange(range.startDate, range.endDate)).join(", ")}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  {tool.isMine ? "Your listing" : tool.ownerName}
                  {tool.ownerTrusted && <TrustedBadge />}
                </span>
                {!tool.isMine && (
                  <button type="button" className="btn" onClick={() => setRequesting(tool)}>
                    Request to borrow
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <RequestDialog tool={requesting} onClose={() => setRequesting(null)} />
    </>
  );
}
