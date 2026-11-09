"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/format";
import { BoxIcon, GridIcon, InboxIcon, SendIcon, ShieldCheckIcon, type IconProps } from "./icons";
import { ErrorNote, LoadingRows, Logo } from "./ui";

type NavLink = { href: string; label: string; short: string; icon: (props: IconProps) => ReactNode };

const LINKS: NavLink[] = [
  { href: "/tools", label: "All tools", short: "Tools", icon: GridIcon },
  { href: "/listings", label: "My listings", short: "Listings", icon: BoxIcon },
  { href: "/requests", label: "My requests", short: "Requests", icon: SendIcon },
  { href: "/incoming", label: "Incoming", short: "Incoming", icon: InboxIcon },
];
const ADMIN_LINK: NavLink = { href: "/admin", label: "Admin", short: "Admin", icon: ShieldCheckIcon };

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

function CountDot({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[11px] font-semibold leading-none text-white">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> waiting for your reply</span>
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, error } = useEnsureUser();
  const me = useQuery(api.users.me, ready ? {} : "skip");
  const incoming = useQuery(api.loans.incoming, ready ? {} : "skip");
  const pathname = usePathname();

  const links = me?.role === "admin" ? [...LINKS, ADMIN_LINK] : LINKS;
  const waiting = incoming?.filter((loan) => loan.status === "pending").length ?? 0;
  const countFor = (href: string) => (href === "/incoming" ? waiting : 0);
  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <a
        href="#main"
        className="sr-only z-30 rounded-lg bg-card px-3 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-20 border-b border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="hidden flex-1 md:block">
            <ul className="flex gap-1">
              {links.map((link) => {
                const active = isActive(link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active ? "bg-brand-soft text-brand-dark" : "text-muted hover:bg-paper hover:text-ink"
                      }`}
                    >
                      {link.label}
                      <CountDot count={countFor(link.href)} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {/* Reserves the avatar's space, so the header doesn't shift when Clerk loads. */}
          <div className="h-7 w-7">
            <UserButton />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-8 sm:px-6 md:pb-12">
        {error ? <ErrorNote message={error} /> : ready ? children : <LoadingRows />}
      </main>

      <nav
        aria-label="Main, mobile"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="flex">
          {links.map((link) => {
            const active = isActive(link.href);
            const Icon = link.icon;
            return (
              <li key={link.href} className="min-w-0 flex-1">
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium ${
                    active ? "text-brand-dark" : "text-muted"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {link.short}
                  <span className="absolute left-1/2 top-1 ml-1">
                    <CountDot count={countFor(link.href)} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
