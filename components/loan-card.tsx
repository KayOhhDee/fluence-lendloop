"use client";

import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { formatRange, timeAgo } from "@/lib/format";
import { CalendarIcon } from "./icons";
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
    <li className={`card p-4 ${loan.isOverdue ? "border-danger/40" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-semibold">{loan.toolName}</h3>
            <LoanStatusBadge loan={loan} />
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm">
            <CalendarIcon className="h-4 w-4 text-muted" />
            {formatRange(loan.startDate, loan.endDate)}
          </p>
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

/** Splits loans by what they need next. Overdue loans lead, then whatever is due back soonest. */
export function groupLoans(loans: LoanView[]) {
  return {
    pending: loans.filter((loan) => loan.status === "pending"),
    active: loans
      .filter((loan) => loan.status === "approved")
      .sort((a, b) => a.endDate.localeCompare(b.endDate)),
    past: loans.filter((loan) => !["pending", "approved"].includes(loan.status)),
  };
}

export function LoanSection({
  title,
  hint,
  loans,
  renderLoan,
}: {
  title: string;
  hint?: string;
  loans: LoanView[];
  renderLoan: (loan: LoanView) => ReactNode;
}) {
  if (loans.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="font-display flex items-center gap-2 text-lg font-semibold">
        {title} <Badge>{loans.length}</Badge>
      </h2>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      <ul className="mt-3 space-y-3">{loans.map(renderLoan)}</ul>
    </section>
  );
}

/** Finished loans stay reachable but out of the way, unless they're all there is to see. */
export function PastLoans({
  loans,
  defaultOpen,
  renderLoan,
}: {
  loans: LoanView[];
  defaultOpen: boolean;
  renderLoan: (loan: LoanView) => ReactNode;
}) {
  if (loans.length === 0) return null;
  return (
    <details open={defaultOpen} className="group">
      <summary className="font-display flex cursor-pointer list-none items-center gap-2 rounded-lg text-lg font-semibold [&::-webkit-details-marker]:hidden">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 text-muted transition-transform group-open:rotate-90"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
        History <Badge>{loans.length}</Badge>
      </summary>
      <ul className="mt-3 space-y-3">{loans.map(renderLoan)}</ul>
    </details>
  );
}
