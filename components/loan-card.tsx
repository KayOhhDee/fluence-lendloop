"use client";

import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { formatRange, timeAgo } from "@/lib/format";
import { Badge, TrustedBadge } from "./ui";

export type LoanView = FunctionReturnType<typeof api.loans.myRequests>[number];

const STATUS: Record<LoanView["status"], { label: string; tone: "neutral" | "brand" | "amber" | "danger" }> = {
  pending: { label: "Awaiting reply", tone: "amber" },
  approved: { label: "Approved", tone: "brand" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  returned: { label: "Returned", tone: "neutral" },
};

const ACTIVITY_DOT = { ok: "bg-brand", pending: "bg-amber", failed: "bg-danger" };

export function LoanStatusBadge({ loan }: { loan: LoanView }) {
  if (loan.isOverdue) return <Badge tone="danger">Overdue</Badge>;
  const status = STATUS[loan.status];
  return <Badge tone={status.tone}>{status.label}</Badge>;
}

export function LoanCard({
  loan,
  people,
  actions,
}: {
  loan: LoanView;
  people: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold">{loan.toolName}</h2>
            <LoanStatusBadge loan={loan} />
          </div>
          <p className="mt-1 text-sm">{formatRange(loan.startDate, loan.endDate)}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">{people}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {loan.activity.length > 0 && (
        <ul aria-label="Automation activity" className="mt-3 space-y-1 border-t border-line pt-3">
          {loan.activity.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-xs text-muted">
              <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${ACTIVITY_DOT[item.state]}`} />
              {item.label} · {timeAgo(item.at)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function LenderLine({ loan }: { loan: LoanView }) {
  return (
    <>
      Lent by {loan.lenderName}
      {loan.lenderTrusted && <TrustedBadge />}
    </>
  );
}
