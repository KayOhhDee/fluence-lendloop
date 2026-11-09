import type { ReactNode } from "react";
import type { Category } from "@/convex/lib/domain";

export type IconProps = { className?: string };

function icon(paths: ReactNode) {
  return function Icon({ className = "h-4 w-4" }: IconProps) {
    return (
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`shrink-0 ${className}`}
      >
        {paths}
      </svg>
    );
  };
}

export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20.5 20.5-4.5-4.5" />
  </>,
);
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const CloseIcon = icon(<path d="M6 6l12 12M18 6 6 18" />);
export const CalendarIcon = icon(
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </>,
);
export const AlertIcon = icon(<path d="M12 4 2.8 20h18.4zM12 10v4.5M12 17.5v.01" />);
export const ShieldCheckIcon = icon(
  <>
    <path d="M12 3l8 3v6c0 4.8-3.3 7.9-8 9-4.7-1.1-8-4.2-8-9V6z" />
    <path d="m9 12 2.2 2.2L15.2 10" />
  </>,
);
export const GridIcon = icon(
  <>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </>,
);
export const BoxIcon = icon(<path d="m3.5 7.8 8.5-4.8 8.5 4.8v8.4L12 21l-8.5-4.8zM3.5 7.8 12 12.6l8.5-4.8M12 12.6V21" />);
export const SendIcon = icon(<path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z" />);
export const InboxIcon = icon(<path d="M3 13.5h5l1.8 3h4.4l1.8-3h5M6 5h12l3 8.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5.5z" />);

const ZapIcon = icon(<path d="M13 2.5 4.5 14H11l-1 7.5L19.5 10H13z" />);
const WrenchIcon = icon(
  <path d="M14.8 6.2a4.2 4.2 0 0 0-5.5 5.4l-5.9 5.9a2 2 0 0 0 2.9 2.9l5.9-5.9a4.2 4.2 0 0 0 5.4-5.5l-2.7 2.7-2.4-.6-.6-2.4z" />,
);
const LeafIcon = icon(<path d="M5.5 20c-1.5-8 3.5-15 15-15.5C21 15 14 21 7 18.5M5.5 20c1.5-4.5 4.5-7.5 9-9.5" />);
const UtensilsIcon = icon(<path d="M7 3v18M4 3v5a3 3 0 0 0 6 0V3M17.5 21V3c-2.2 1-3.5 4-3.5 7.5 0 2.5 1.2 4 3.5 4" />);
const TentIcon = icon(<path d="M12 4 2.5 20h19zM12 12l-4 8M12 12l4 8" />);
const SparklesIcon = icon(
  <path d="m11 4 1.8 5.2L18 11l-5.2 1.8L11 18l-1.8-5.2L4 11l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />,
);

const CATEGORY_ICONS: Record<Category, ReturnType<typeof icon>> = {
  power_tools: ZapIcon,
  hand_tools: WrenchIcon,
  garden: LeafIcon,
  kitchen: UtensilsIcon,
  camping: TentIcon,
  cleaning: SparklesIcon,
  other: BoxIcon,
};

/** Listings have no photos, so a category tile gives the eye something to scan by. */
export function CategoryTile({ category, small = false }: { category: Category; small?: boolean }) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center bg-brand-soft text-brand-dark ${
        small ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl"
      }`}
    >
      <Icon className={small ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  );
}
