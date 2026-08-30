"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { SCHOOL_QUERY_PARAM, withEstablishmentQuery } from "@/lib/school/establishmentContext";

type Props = {
  items: { href: string; label: string }[];
  accessibleSchoolIds: string[];
  fallbackSchoolId: string | null;
};

export function ProNavigation({ items, accessibleSchoolIds, fallbackSchoolId }: Props) {
  const searchParams = useSearchParams();
  const explicitId = searchParams.get(SCHOOL_QUERY_PARAM);
  const schoolId = accessibleSchoolIds.includes(explicitId ?? "") ? explicitId : fallbackSchoolId;

  return (
    <nav className="flex gap-1 overflow-x-auto px-6">
      {items.map((item) => (
        <Link
          key={item.href}
          href={withEstablishmentQuery(item.href, schoolId)}
          className="shrink-0 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:border-emerald-500 hover:text-white"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function ProContextLink({
  href,
  accessibleSchoolIds,
  fallbackSchoolId,
  children,
  className,
}: {
  href: string;
  accessibleSchoolIds: string[];
  fallbackSchoolId: string | null;
  children: ReactNode;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const explicitId = searchParams.get(SCHOOL_QUERY_PARAM);
  const schoolId = accessibleSchoolIds.includes(explicitId ?? "") ? explicitId : fallbackSchoolId;

  return (
    <Link href={withEstablishmentQuery(href, schoolId)} className={className}>
      {children}
    </Link>
  );
}
