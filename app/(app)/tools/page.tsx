"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarIcon, CategoryTile, GridIcon, SearchIcon } from "@/components/icons";
import { RequestDialog, type RequestableTool } from "@/components/request-dialog";
import { AvailabilityBadge, ChipGroup, EmptyState, LoadingGrid, PageHeader, TrustedBadge } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { CATEGORIES, type Category } from "@/convex/lib/domain";
import { categoryLabel, conditionLabel, formatRange } from "@/lib/format";

const FILTERS: { value: Category | undefined; label: string }[] = [{ value: undefined, label: "All" }, ...CATEGORIES];
const BOOKINGS_SHOWN = 2;

export default function ToolsPage() {
  const [category, setCategory] = useState<Category | undefined>();
  const [search, setSearch] = useState("");
  const [requesting, setRequesting] = useState<RequestableTool | null>(null);
  const tools = useQuery(api.tools.list, { category });

  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      tools?.filter((tool) =>
        [tool.name, tool.description, tool.ownerName].some((text) => text.toLowerCase().includes(term)),
      ),
    [tools, term],
  );
  const filtering = term !== "" || category !== undefined;

  return (
    <>
      <PageHeader title="All tools" intro="Everything your neighbors are willing to lend." />

      <div className="mb-6 space-y-3">
        <div className="relative max-w-md">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            aria-label="Search tools"
            placeholder="Search for a drill, a ladder, a tent…"
            className="field pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <ChipGroup label="Filter by category" options={FILTERS} value={category} onChange={setCategory} />
      </div>

      {visible === undefined ? (
        <LoadingGrid />
      ) : visible.length === 0 ? (
        filtering ? (
          <EmptyState
            title="No tools match that"
            icon={<SearchIcon className="h-6 w-6" />}
            action={
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSearch("");
                  setCategory(undefined);
                }}
              >
                Clear search and filters
              </button>
            }
          >
            Try a different word or category.
          </EmptyState>
        ) : (
          <EmptyState
            title="Nothing here yet"
            icon={<GridIcon className="h-6 w-6" />}
            action={
              <Link href="/listings" className="btn btn-primary">
                List the first tool
              </Link>
            }
          >
            Once a neighbor lists something, it&apos;ll appear here.
          </EmptyState>
        )
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((tool) => {
            const extraBookings = tool.bookedRanges.length - BOOKINGS_SHOWN;
            return (
              <li key={tool.id} className="card flex flex-col p-4 transition-shadow hover:shadow-raised">
                <div className="flex items-start gap-3">
                  <CategoryTile category={tool.category} />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-semibold leading-snug">{tool.name}</h2>
                    <p className="mt-0.5 text-xs text-muted">
                      {categoryLabel(tool.category)} · {conditionLabel(tool.condition)}
                    </p>
                  </div>
                  <AvailabilityBadge availability={tool.availability} />
                </div>
                <p className="mt-3 line-clamp-3 flex-1 text-sm">{tool.description}</p>
                {tool.bookedRanges.length > 0 && (
                  <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    <span>
                      Booked{" "}
                      {tool.bookedRanges
                        .slice(0, BOOKINGS_SHOWN)
                        .map((range) => formatRange(range.startDate, range.endDate))
                        .join(" · ")}
                      {extraBookings > 0 && ` · ${extraBookings} more`}
                    </span>
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <span className="flex min-h-10 flex-wrap items-center gap-2 text-sm text-muted">
                    {tool.isMine ? "Your listing" : tool.ownerName}
                    {tool.ownerTrusted && <TrustedBadge />}
                  </span>
                  {!tool.isMine && (
                    <button type="button" className="btn btn-soft ml-auto" onClick={() => setRequesting(tool)}>
                      Request to borrow
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <RequestDialog tool={requesting} onClose={() => setRequesting(null)} />
    </>
  );
}
