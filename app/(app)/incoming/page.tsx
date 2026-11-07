"use client";

import { useMutation, useQuery } from "convex/react";
import { LoanCard, type LoanView } from "@/components/loan-card";
import { EmptyState, ErrorNote, LoadingRows, PageHeader, useAction } from "@/components/ui";
import { api } from "@/convex/_generated/api";

export default function IncomingPage() {
  const loans = useQuery(api.loans.incoming);
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);
  const cancel = useMutation(api.loans.cancel);
  const { busy, error, run } = useAction();

  function actionsFor(loan: LoanView) {
    const loanId = loan.id;
    if (loan.status === "pending") {
      return (
        <>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => approve({ loanId }))}>
            Approve
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => decline({ loanId }))}>
            Decline
          </button>
        </>
      );
    }
    if (loan.status === "approved") {
      return (
        <>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => markReturned({ loanId }))}>
            Mark returned
          </button>
          {!loan.hasStarted && (
            <button type="button" className="btn" disabled={busy} onClick={() => run(() => cancel({ loanId }))}>
              Cancel loan
            </button>
          )}
        </>
      );
    }
    return null;
  }

  return (
    <>
      <PageHeader title="Incoming requests" intro="Neighbors asking to borrow your tools." />
      <div className="mb-4">
        <ErrorNote message={error} />
      </div>
      {loans === undefined ? (
        <LoadingRows />
      ) : loans.length === 0 ? (
        <EmptyState title="No requests yet">When someone asks to borrow a tool, it&apos;ll show up here.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {loans.map((loan) => (
            <LoanCard
              key={loan.id}
              loan={loan}
              people={<>Requested by {loan.borrowerName}</>}
              actions={actionsFor(loan)}
            />
          ))}
        </ul>
      )}
    </>
  );
}
