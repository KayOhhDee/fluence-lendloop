"use client";

import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { categoryLabel } from "@/lib/format";
import { CategoryTile } from "./icons";
import { EmptyState, LoadingGrid, Logo } from "./ui";

const PREVIEW_COUNT = 12;

const STEPS = [
  { title: "List what you own", text: "Add the tools you're happy to lend, from a ladder to a camping stove." },
  { title: "Ask for the days you need", text: "See what's free, pick your dates, and the owner approves or declines." },
  { title: "Bring it back", text: "The lender marks it returned, and overdue loans get a friendly reminder." },
];

export function PublicHome() {
  const tools = useQuery(api.tools.listPublic);
  const hidden = (tools?.length ?? 0) - PREVIEW_COUNT;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between gap-3 py-5">
        <Logo />
        <Show when="signed-in">
          <Link href="/tools" className="btn">
            Go to the board
          </Link>
        </Show>
        <Show when="signed-out">
          <SignInButton mode="modal" forceRedirectUrl="/tools">
            <button className="btn">Sign in</button>
          </SignInButton>
        </Show>
      </header>

      <section className="grid items-center gap-10 py-10 lg:grid-cols-[1.25fr_1fr] lg:py-16">
        <div>
          <h1 className="font-display text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Borrow what you need. Lend what you don&apos;t.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            The drill in your neighbor&apos;s garage only gets used a few minutes a year. LendLoop puts it to work on
            your street.
          </p>
          <div className="mt-7">
            <Show when="signed-out">
              <SignUpButton mode="modal" forceRedirectUrl="/tools">
                <button className="btn btn-primary px-5 py-2.5 text-base">Join your neighbors</button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link href="/tools" className="btn btn-primary px-5 py-2.5 text-base">
                Browse the board
              </Link>
            </Show>
          </div>
        </div>

        <ol aria-label="How it works" className="card divide-y divide-line">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4 p-5">
              <span
                aria-hidden
                className="font-display inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-dark"
              >
                {index + 1}
              </span>
              <div>
                <h2 className="font-medium">{step.title}</h2>
                <p className="mt-0.5 text-sm text-muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="pb-16" aria-labelledby="available-heading">
        <h2 id="available-heading" className="font-display mb-4 text-2xl font-semibold tracking-tight">
          Available now
        </h2>
        {tools === undefined ? (
          <LoadingGrid count={3} />
        ) : tools.length === 0 ? (
          <EmptyState title="Nothing listed yet">Be the first on your street to lend something.</EmptyState>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tools.slice(0, PREVIEW_COUNT).map((tool) => (
                <li key={tool.id} className="card flex min-w-0 items-center gap-3 p-3">
                  <CategoryTile category={tool.category} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{tool.name}</p>
                    <p className="text-xs text-muted">{categoryLabel(tool.category)}</p>
                  </div>
                </li>
              ))}
            </ul>
            {hidden > 0 && <p className="mt-4 text-sm text-muted">And {hidden} more on the board.</p>}
          </>
        )}
      </section>
    </div>
  );
}
