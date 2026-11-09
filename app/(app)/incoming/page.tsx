"use client";

import { useMutation, useQuery } from "convex/react";
import { InboxIcon } from "@/components/icons";
import { groupLoans, LoanCard, LoanSection, PastLoans, type LoanView } from "@/components/loan-card";
import { EmptyState, ErrorNote, LoadingRows, PageHeader, useAction, useConfirm } from "@/components/ui";
import { api } from "@/convex/_generated/api";

export default function IncomingPage() {
  const loans = useQuery(api.loans.incoming);
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);
  const cancel = useMutation(api.loans.cancel);
  const { busy, error, run } = useAction();
  const { confirm, confirmDialog } = useConfirm();

  function actionsFor(loan: LoanView) {
    const loanId = loan.id;
    if (loan.status === "pending") {
      return (
        <>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => approve({ loanId }))}>
            Approve
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              confirm({
                title: `Decline ${loan.borrowerName}'s request?`,
                body: `We'll let ${loan.borrowerName} know the ${loan.toolName} isn't available for those dates.`,
                confirmLabel: "Decline request",
                danger: true,
                action: () => decline({ loanId }),
              })
            }
          >
            Decline
          </button>
        </>
      );
    }
    if (loan.status === "approved") {
      return (
        <>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              confirm({
                title: `Got the ${loan.toolName} back?`,
                body: `This closes the loan and stops any reminders to ${loan.borrowerName}. It can't be undone.`,
                confirmLabel: "Mark returned",
                cancelLabel: "Not yet",
                action: () => markReturned({ loanId }),
              })
            }
          >
            Mark returned
          </button>
          {!loan.hasStarted && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                confirm({
                  title: "Cancel this loan?",
                  body: `We'll let ${loan.borrowerName} know the ${loan.toolName} is no longer available.`,
                  confirmLabel: "Cancel loan",
                  danger: true,
                  action: () => cancel({ loanId }),
                })
              }
            >
              Cancel loan
            </button>
          )}
        </>
      );
    }
    return null;
  }

  const renderLoan = (loan: LoanView) => (
    <LoanCard key={loan.id} loan={loan} people={<>Requested by {loan.borrowerName}</>} actions={actionsFor(loan)} />
  );

  const header = <PageHeader title="Incoming requests" intro="Neighbors asking to borrow your tools." />;
  if (loans === undefined) {
    return (
      <>
        {header}
        <LoadingRows />
      </>
    );
  }

  const { pending, active, past } = groupLoans(loans);
  return (
    <>
      {header}
      {error && (
        <div className="mb-4">
          <ErrorNote message={error} />
        </div>
      )}
      {loans.length === 0 ? (
        <EmptyState title="No requests yet" icon={<InboxIcon className="h-6 w-6" />}>
          When someone asks to borrow a tool, it&apos;ll show up here.
        </EmptyState>
      ) : (
        <>
          <LoanSection
            title="Needs your reply"
            hint="Approving a request also declines any others that overlap its dates."
            loans={pending}
            renderLoan={renderLoan}
          />
          <LoanSection title="Lent out" loans={active} renderLoan={renderLoan} />
          <PastLoans loans={past} defaultOpen={pending.length + active.length === 0} renderLoan={renderLoan} />
        </>
      )}
      {confirmDialog}
    </>
  );
}
