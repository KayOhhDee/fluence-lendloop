"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { LenderLine, LoanCard } from "@/components/loan-card";
import { EmptyState, ErrorNote, LoadingRows, PageHeader, useAction } from "@/components/ui";
import { api } from "@/convex/_generated/api";

export default function RequestsPage() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useMutation(api.loans.cancel);
  const { busy, error, run } = useAction();

  return (
    <>
      <PageHeader title="My requests" intro="Everything you've asked to borrow." />
      <div className="mb-4">
        <ErrorNote message={error} />
      </div>
      {loans === undefined ? (
        <LoadingRows />
      ) : loans.length === 0 ? (
        <EmptyState title="No requests yet">
          <Link href="/tools" className="underline">
            See what&apos;s available
          </Link>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {loans.map((loan) => {
            const canCancel = loan.status === "pending" || (loan.status === "approved" && !loan.hasStarted);
            return (
              <LoanCard
                key={loan.id}
                loan={loan}
                people={<LenderLine loan={loan} />}
                actions={
                  canCancel && (
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => run(() => cancel({ loanId: loan.id }))}
                    >
                      Cancel
                    </button>
                  )
                }
              />
            );
          })}
        </ul>
      )}
    </>
  );
}
