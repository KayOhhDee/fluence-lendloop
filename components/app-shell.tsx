"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/format";
import { ErrorNote, LoadingRows } from "./ui";

const LINKS = [
  { href: "/tools", label: "All tools" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming requests" },
];

/** Creates the Convex user record before rendering anything that queries as that user. */
function useEnsureUser() {
  const { isSignedIn } = useAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const ensureCurrent = useMutation(api.users.ensureCurrent);
  const [ready, setReady] = useState(false);
  const [setupError, setError] = useState<string | null>(null);

  // Signed in with Clerk but refused by Convex almost always means a setup problem. Say so,
  // rather than leaving a spinner running forever.
  const error =
    setupError ??
    (isSignedIn && !isLoading && !isAuthenticated
      ? "You're signed in, but the app couldn't verify your session. Please try again shortly."
      : null);

  useEffect(() => {
    if (!isAuthenticated) return;
    ensureCurrent()
      .then(() => setReady(true))
      .catch((err) => setError(errorMessage(err)));
  }, [isAuthenticated, ensureCurrent]);

  return { ready, error };
}

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, error } = useEnsureUser();
  const me = useQuery(api.users.me, ready ? {} : "skip");
  const pathname = usePathname();
  const links = me?.role === "admin" ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 pt-3 sm:px-6">
          <Link href="/" className="font-display text-xl font-semibold">
            LendLoop
          </Link>
          <UserButton />
        </div>
        <nav aria-label="Main" className="mx-auto w-full max-w-5xl overflow-x-auto px-2 sm:px-4">
          <ul className="flex gap-1 whitespace-nowrap pt-2">
            {links.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`block border-b-2 px-2.5 pb-2.5 pt-1 text-sm font-medium ${
                      active ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {error ? <ErrorNote message={error} /> : ready ? children : <LoadingRows />}
      </main>
    </div>
  );
}
