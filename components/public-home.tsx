"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { categoryLabel } from "@/lib/format";
import { Badge, EmptyState, LoadingRows } from "./ui";

export function PublicHome() {
  const tools = useQuery(api.tools.listPublic);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <span className="font-display text-xl font-semibold">LendLoop</span>
        <Show when="signed-in">
          <Link href="/tools" className="btn">
            Go to the board
          </Link>
        </Show>
      </header>

      <section className="py-10 sm:py-16">
        <h1 className="font-display max-w-2xl text-4xl font-semibold tracking-tight sm:text-6xl">
          Borrow what you need. Lend what you don&apos;t.
        </h1>
        <p className="mt-4 max-w-xl text-muted">
          The drill in your neighbor&apos;s garage only gets used a few minutes a year. LendLoop puts it to work on
          your street.
        </p>
        <div className="mt-6">
          <Show when="signed-out">
            <SignInButton mode="modal" forceRedirectUrl="/tools">
              <button className="btn btn-primary px-5 py-2.5">Sign in to lend or borrow</button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link href="/tools" className="btn btn-primary px-5 py-2.5">
              Browse the board
            </Link>
          </Show>
        </div>
      </section>

      <section className="pb-16" aria-labelledby="available-heading">
        <h2 id="available-heading" className="font-display mb-4 text-xl font-semibold">
          Available now
        </h2>
        {tools === undefined ? (
          <LoadingRows count={2} />
        ) : tools.length === 0 ? (
          <EmptyState title="Nothing listed yet">Be the first on your street to lend something.</EmptyState>
        ) : (
          <ul className="card divide-y divide-line">
            {tools.map((tool) => (
              <li key={tool.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="font-medium">{tool.name}</span>
                <Badge>{categoryLabel(tool.category)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
