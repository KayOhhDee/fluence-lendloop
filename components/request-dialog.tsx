"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { addDays, daysBetween, isValidIsoDate, rangesOverlap } from "@/convex/lib/dates";
import { LIMITS } from "@/convex/lib/domain";
import { firstFreeDay, formatRange, localToday } from "@/lib/format";
import { CalendarIcon } from "./icons";
import { Badge, ErrorNote, Modal, useAction } from "./ui";

export type RequestableTool = {
  id: Id<"tools">;
  name: string;
  bookedRanges: { startDate: string; endDate: string }[];
};

export function RequestDialog({ tool, onClose }: { tool: RequestableTool | null; onClose: () => void }) {
  return (
    <Modal title={tool ? `Borrow the ${tool.name}` : ""} open={tool !== null} onClose={onClose}>
      {tool && <RequestForm key={tool.id} tool={tool} onClose={onClose} />}
    </Modal>
  );
}

function RequestForm({ tool, onClose }: { tool: RequestableTool; onClose: () => void }) {
  const request = useMutation(api.loans.request);
  const router = useRouter();
  const { busy, error, run } = useAction();
  const today = localToday();
  const [startDate, setStartDate] = useState(() => firstFreeDay(today, tool.bookedRanges));
  const [endDate, setEndDate] = useState(startDate);

  // A date input reports an empty string while someone is partway through typing a date.
  const startValid = isValidIsoDate(startDate);
  const rangeValid = startValid && isValidIsoDate(endDate) && endDate >= startDate;
  const latestEnd = startValid ? addDays(startDate, LIMITS.maxLoanDays - 1) : undefined;
  const days = rangeValid ? daysBetween(startDate, endDate) + 1 : 0;
  const clash = rangeValid && tool.bookedRanges.some((range) => rangesOverlap(range, { startDate, endDate }));

  function changeStart(value: string) {
    setStartDate(value);
    if (!isValidIsoDate(value)) return;
    const longest = addDays(value, LIMITS.maxLoanDays - 1);
    if (value > endDate) setEndDate(value);
    else if (endDate > longest) setEndDate(longest);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const sent = await run(() => request({ toolId: tool.id, startDate, endDate }));
    if (sent) router.push("/requests");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {tool.bookedRanges.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium">Already booked</p>
          <ul className="flex flex-wrap gap-1.5">
            {tool.bookedRanges.map((range) => (
              <li key={range.startDate}>
                <Badge tone="amber">{formatRange(range.startDate, range.endDate)}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="start-date">
            From
          </label>
          <input
            id="start-date"
            type="date"
            className="field"
            required
            min={today}
            max={addDays(today, LIMITS.maxBookingLeadDays)}
            value={startDate}
            onChange={(event) => changeStart(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="end-date">
            Until
          </label>
          <input
            id="end-date"
            type="date"
            className="field"
            required
            min={startValid ? startDate : today}
            max={latestEnd}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
      </div>
      {clash ? (
        <ErrorNote message="Those dates overlap a booking. Please choose different days." />
      ) : (
        days > 0 && (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <CalendarIcon className="h-4 w-4" />
            {days === 1 ? "1 day" : `${days} days`}. Loans can last up to {LIMITS.maxLoanDays} days.
          </p>
        )
      )}
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || clash}>
          {busy ? "Sending…" : "Send request"}
        </button>
      </div>
    </form>
  );
}
