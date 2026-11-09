"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { errorMessage } from "@/lib/format";
import { AlertIcon, CloseIcon, ShieldCheckIcon } from "./icons";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-lg font-display text-xl font-semibold">
      <svg aria-hidden viewBox="0 0 32 32" className="h-7 w-7 shrink-0">
        <rect width="32" height="32" rx="9" className="fill-brand" />
        <path
          d="M22 12.5a7.5 7.5 0 1 0 1.5 4.5M22.5 7.5v5h-5"
          fill="none"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      LendLoop
    </Link>
  );
}

export function PageHeader({ title, intro, action }: { title: string; intro?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {intro && <p className="mt-1 text-sm text-muted">{intro}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-12 text-center">
      {icon && (
        <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-dark">
          {icon}
        </span>
      )}
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-line/50" />
      ))}
    </div>
  );
}

export function LoadingGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-52 animate-pulse rounded-xl bg-line/50" />
      ))}
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-line/60 text-ink",
  brand: "bg-brand-soft text-brand-dark",
  amber: "bg-amber-soft text-amber",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function TrustedBadge() {
  return (
    <Badge tone="brand">
      <ShieldCheckIcon className="h-3.5 w-3.5" />
      Trusted Lender
    </Badge>
  );
}

export function AvailabilityBadge({ availability }: { availability: "available" | "on_loan" }) {
  return availability === "available" ? <Badge tone="brand">Available</Badge> : <Badge tone="amber">On loan</Badge>;
}

export function ErrorNote({ message }: { message: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);

  // Actions can sit far below the note on a long list, so bring a new error into view.
  useEffect(() => {
    if (message) ref.current?.scrollIntoView({ block: "nearest" });
  }, [message]);

  if (!message) return null;
  return (
    <p
      ref={ref}
      role="alert"
      className="flex scroll-mt-24 scroll-mb-24 items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
    >
      <AlertIcon className="mt-0.5 h-4 w-4" />
      {message}
    </p>
  );
}

/** A row of mutually exclusive filter buttons. */
export function ChipGroup<T>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`chip ${active ? "chip-active" : ""}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Follows the ARIA tabs pattern: one tab stop, with arrow keys moving between tabs. */
export function Tabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
  children,
}: {
  label: string;
  tabs: readonly T[];
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
}) {
  const baseId = useId();
  const tabId = (name: T) => `${baseId}-tab-${name}`;
  const panelId = `${baseId}-panel`;

  function onKeyDown(event: KeyboardEvent) {
    const index = tabs.indexOf(value);
    const next = {
      ArrowRight: tabs[(index + 1) % tabs.length],
      ArrowLeft: tabs[(index - 1 + tabs.length) % tabs.length],
      Home: tabs[0],
      End: tabs[tabs.length - 1],
    }[event.key];
    if (!next) return;
    event.preventDefault();
    onChange(next);
    document.getElementById(tabId(next))?.focus();
  }

  return (
    <>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="mb-6 flex gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((name) => (
          <button
            key={name}
            id={tabId(name)}
            role="tab"
            type="button"
            aria-selected={value === name}
            aria-controls={panelId}
            tabIndex={value === name ? 0 : -1}
            onClick={() => onChange(name)}
            className={`-mb-px cursor-pointer whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:-outline-offset-2 ${
              value === name ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(value)}>
        {children}
      </div>
    </>
  );
}

export function Modal({
  title,
  open,
  onClose,
  closeOnBackdrop = true,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  /** Turn off for forms, where a stray click would throw away what someone typed. */
  closeOnBackdrop?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) {
      dialog?.showModal();
      // showModal() focuses the first control, which is the close button unless told otherwise.
      dialog?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog?.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // The content fills the dialog, so a press landing on the dialog itself is on the backdrop.
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-card p-0 text-ink shadow-dialog open:animate-dialog-in"
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="font-display text-xl font-semibold">
              {title}
            </h2>
            <button
              type="button"
              className="-m-1.5 cursor-pointer rounded-lg p-1.5 text-muted transition-colors hover:bg-paper hover:text-ink"
              onClick={onClose}
              aria-label="Close"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Runs a mutation with in-flight and error state, so each caller doesn't have to. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run };
}

export type ConfirmRequest = {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  action: () => Promise<unknown>;
};

/** Asks before anything that can't be undone. Failures stay in the dialog, next to the button pressed. */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const close = () => setRequest(null);

  const confirmDialog = (
    <Modal title={request?.title ?? ""} open={request !== null} onClose={close}>
      {request && <ConfirmBody request={request} onClose={close} />}
    </Modal>
  );

  return { confirm: setRequest, confirmDialog };
}

function ConfirmBody({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const { busy, error, run } = useAction();

  async function confirm() {
    if (await run(request.action)) onClose();
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted">{request.body}</div>
      <ErrorNote message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          {request.cancelLabel ?? "Never mind"}
        </button>
        <button
          type="button"
          className={`btn ${request.danger ? "btn-danger-solid" : "btn-primary"}`}
          disabled={busy}
          onClick={confirm}
        >
          {busy ? "Working…" : request.confirmLabel}
        </button>
      </div>
    </div>
  );
}
