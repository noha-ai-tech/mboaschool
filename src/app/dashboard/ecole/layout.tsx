"use client";

import { Suspense } from "react";
import { DashboardSchoolAdminShell } from "@/components/school-admin/DashboardSchoolAdminShell";
import { SchoolProvider } from "@/lib/school/SchoolContext";

export default function EcoleDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SchoolProvider>
        <DashboardSchoolAdminShell>{children}</DashboardSchoolAdminShell>
      </SchoolProvider>
    </Suspense>
  );
}
