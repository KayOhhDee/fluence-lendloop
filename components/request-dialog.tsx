"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRange, localToday } from "@/lib/format";
import { ErrorNote, Modal, useAction } from "./ui";

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
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const sent = await run(() => request({ toolId: tool.id, startDate, endDate }));
    if (sent) router.push("/requests");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {tool.bookedRanges.length > 0 && (
        <p className="text-sm text-muted">
          Already booked: {tool.bookedRanges.map((range) => formatRange(range.startDate, range.endDate)).join(", ")}
        </p>
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
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              if (event.target.value > endDate) setEndDate(event.target.value);
            }}
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
            min={startDate}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
      </div>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </button>
      </div>
    </form>
  );
}
