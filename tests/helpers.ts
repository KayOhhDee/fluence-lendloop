/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.*s");

export function setup() {
  return convexTest(schema, modules);
}

export type T = ReturnType<typeof setup>;

export async function addUser(
  t: T,
  slug: string,
  options: { role?: "admin" | "user"; name?: string } = {},
): Promise<{ id: Id<"users">; as: ReturnType<T["withIdentity"]> }> {
  const tokenIdentifier = `test|${slug}`;
  const id = await t.run((ctx) =>
    ctx.db.insert("users", {
      tokenIdentifier,
      name: options.name ?? `${slug} Lastname`,
      email: `${slug}@example.test`,
      role: options.role ?? "user",
      trustedLender: false,
    }),
  );
  return { id, as: t.withIdentity({ tokenIdentifier, subject: slug, issuer: "test" }) };
}

export const TOOL = {
  name: "Drill",
  category: "power_tools",
  condition: "good",
  description: "A good drill.",
} as const;

export function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}
