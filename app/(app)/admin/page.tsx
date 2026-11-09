"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { CategoryTile } from "@/components/icons";
import { LenderLine, LoanCard } from "@/components/loan-card";
import {
  Badge,
  ChipGroup,
  EmptyState,
  ErrorNote,
  LoadingRows,
  PageHeader,
  Tabs,
  TrustedBadge,
  useAction,
  useConfirm,
} from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { categoryLabel, timeAgo } from "@/lib/format";

const TABS = ["Loans", "Listings", "Lenders", "Automation"] as const;
type Tab = (typeof TABS)[number];

type LoanStatus = "pending" | "approved" | "declined" | "cancelled" | "returned";
const LOAN_FILTERS: { value: LoanStatus | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
  { value: "returned", label: "Returned" },
];

export default function AdminPage() {
  const me = useQuery(api.users.me);
  const [tab, setTab] = useState<Tab>("Loans");

  if (me === undefined) return <LoadingRows />;
  // The check that matters is in Convex; this only avoids showing a page of errors.
  if (me?.role !== "admin") return <EmptyState title="Admins only">You don&apos;t have access to this page.</EmptyState>;

  return (
    <>
      <PageHeader title="Admin" intro="Look after the neighborhood." />
      <Tabs label="Admin sections" tabs={TABS} value={tab} onChange={setTab}>
        <h2 className="sr-only">{tab}</h2>
        {tab === "Loans" && <LoansTab />}
        {tab === "Listings" && <ListingsTab />}
        {tab === "Lenders" && <LendersTab />}
        {tab === "Automation" && <AutomationTab />}
      </Tabs>
    </>
  );
}

function LoansTab() {
  const [status, setStatus] = useState<LoanStatus | undefined>();
  const loans = useQuery(api.admin.allLoans, { status });

  return (
    <>
      <div className="mb-4">
        <ChipGroup label="Filter by status" options={LOAN_FILTERS} value={status} onChange={setStatus} />
      </div>
      {loans === undefined ? (
        <LoadingRows />
      ) : loans.length === 0 ? (
        <EmptyState title="No loans to show" />
      ) : (
        <ul className="space-y-3">
          {loans.map((loan) => (
            <LoanCard
              key={loan.id}
              loan={loan}
              people={
                <>
                  <LenderLine loan={loan} /> · Borrowed by {loan.borrowerName}
                </>
              }
            />
          ))}
        </ul>
      )}
    </>
  );
}

function ListingsTab() {
  const listings = useQuery(api.admin.allListings);
  const remove = useMutation(api.admin.removeListing);
  const { confirm, confirmDialog } = useConfirm();

  if (listings === undefined) return <LoadingRows />;
  if (listings.length === 0) return <EmptyState title="No listings" />;
  return (
    <>
      <ul className="card divide-y divide-line">
        {listings.map((listing) => (
          <li key={listing.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <CategoryTile category={listing.category} small />
              <div className="min-w-0">
                <p className="font-medium">{listing.name}</p>
                <p className="text-xs text-muted">
                  {categoryLabel(listing.category)} · {listing.ownerName}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() =>
                confirm({
                  title: `Remove the ${listing.name}?`,
                  body: "Open requests and upcoming loans will be closed. This is recorded in the audit log.",
                  confirmLabel: "Remove listing",
                  cancelLabel: "Keep listing",
                  danger: true,
                  action: () => remove({ toolId: listing.id }),
                })
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {confirmDialog}
    </>
  );
}

function LendersTab() {
  const lenders = useQuery(api.admin.lenders);
  const setTrusted = useMutation(api.admin.setTrustedLender);
  const { busy, error, run } = useAction();

  if (lenders === undefined) return <LoadingRows />;
  if (lenders.length === 0) return <EmptyState title="No lenders yet" />;
  return (
    <>
      {error && (
        <div className="mb-4">
          <ErrorNote message={error} />
        </div>
      )}
      <ul className="card divide-y divide-line">
        {lenders.map((lender) => (
          <li key={lender.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{lender.name}</span>
              <span className="text-xs text-muted">
                {lender.listings} {lender.listings === 1 ? "listing" : "listings"}
              </span>
              {lender.trustedLender && <TrustedBadge />}
            </div>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => run(() => setTrusted({ userId: lender.id, trusted: !lender.trustedLender }))}
            >
              {lender.trustedLender ? "Remove trust" : "Mark as Trusted Lender"}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h3 className="font-display mb-3 text-lg font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function AutomationTab() {
  const health = useQuery(api.admin.automationHealth);
  const audit = useQuery(api.admin.recentAudit);
  const retry = useMutation(api.admin.retryNotification);
  const { busy, error, run } = useAction();

  if (health === undefined) return <LoadingRows />;
  const failed = health.failedNotifications.length;
  return (
    <>
      <dl className="mb-8 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Last overdue reminder run",
            value: health.lastOverdueRunAt ? timeAgo(health.lastOverdueRunAt) : "Never",
            alert: false,
          },
          {
            label: "Notifications queued",
            value: health.pendingCount > 100 ? "100+" : String(health.pendingCount),
            alert: false,
          },
          { label: "Notifications failed", value: String(failed), alert: failed > 0 },
        ].map((stat) => (
          <div key={stat.label} className={`card p-4 ${stat.alert ? "border-danger/40" : ""}`}>
            <dt className="text-xs text-muted">{stat.label}</dt>
            <dd className={`font-display mt-1 text-2xl font-semibold ${stat.alert ? "text-danger" : ""}`}>
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <Section title="Failed notifications">
        {error && (
          <div className="mb-3">
            <ErrorNote message={error} />
          </div>
        )}
        {failed === 0 ? (
          <EmptyState title="Nothing has failed" />
        ) : (
          <ul className="card divide-y divide-line">
            {health.failedNotifications.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="font-medium">
                    {row.toolName} <Badge>{row.event}</Badge>
                  </p>
                  <p className="break-words text-xs text-muted">
                    {row.lastError} · {row.attempts} attempts · {timeAgo(row.at)}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => run(() => retry({ notificationId: row.id }))}
                >
                  Retry
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Workflow failures">
        {health.workflowFailures.length === 0 ? (
          <EmptyState title="No workflow failures" />
        ) : (
          <ul className="card divide-y divide-line">
            {health.workflowFailures.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <p className="font-medium">
                  {row.workflow} {row.source === "watchdog" && <Badge tone="amber">Watchdog</Badge>}
                </p>
                <p className="break-words text-xs text-muted">
                  {row.node ? `${row.node}: ` : ""}
                  {row.message} · {timeAgo(row.at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Admin audit log">
        {!audit || audit.length === 0 ? (
          <EmptyState title="No admin actions yet" />
        ) : (
          <ul className="card divide-y divide-line">
            {audit.map((row) => (
              <li key={row.id} className="px-4 py-3 text-sm">
                <span className="font-medium">{row.actorName}</span> · {row.action}
                {row.detail ? ` (${row.detail})` : ""} <span className="text-xs text-muted">· {timeAgo(row.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
