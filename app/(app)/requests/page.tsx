"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { SendIcon } from "@/components/icons";
import { groupLoans, LenderLine, LoanCard, LoanSection, PastLoans, type LoanView } from "@/components/loan-card";
import { EmptyState, LoadingRows, PageHeader, useConfirm } from "@/components/ui";
import { api } from "@/convex/_generated/api";

export default function RequestsPage() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useMutation(api.loans.cancel);
  const { confirm, confirmDialog } = useConfirm();

  function renderLoan(loan: LoanView) {
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
              onClick={() =>
                confirm({
                  title: loan.status === "pending" ? "Cancel this request?" : "Cancel this loan?",
                  body: `We'll let ${loan.lenderName} know you no longer need the ${loan.toolName}.`,
                  confirmLabel: loan.status === "pending" ? "Cancel request" : "Cancel loan",
                  danger: true,
                  action: () => cancel({ loanId: loan.id }),
                })
              }
            >
              Cancel
            </button>
          )
        }
      />
    );
  }

  const header = <PageHeader title="My requests" intro="Everything you've asked to borrow." />;
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
      {loans.length === 0 ? (
        <EmptyState
          title="No requests yet"
          icon={<SendIcon className="h-6 w-6" />}
          action={
            <Link href="/tools" className="btn btn-primary">
              See what&apos;s available
            </Link>
          }
        >
          When you ask to borrow something, you can follow it here.
        </EmptyState>
      ) : (
        <>
          <LoanSection title="Borrowing" loans={active} renderLoan={renderLoan} />
          <LoanSection title="Waiting for a reply" loans={pending} renderLoan={renderLoan} />
          <PastLoans loans={past} defaultOpen={pending.length + active.length === 0} renderLoan={renderLoan} />
        </>
      )}
      {confirmDialog}
    </>
  );
}
