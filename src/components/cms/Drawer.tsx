"use client";

import type { ReactNode } from "react";
import { SchoolAdminDrawer } from "@/components/school-admin/ui/Overlay";

export function Drawer({ open, onClose, title, description, children, footer, closeDisabled = false }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; closeDisabled?: boolean;
}) {
  const handleClose = () => { if (!closeDisabled) onClose(); };
  return (
    <SchoolAdminDrawer open={open} onClose={handleClose} title={title} description={description}
      closeOnBackdrop={!closeDisabled} closeLabel={closeDisabled ? "Enregistrement en cours" : "Fermer le panneau d’édition"} footer={footer}>
      {children}
    </SchoolAdminDrawer>
  );
}
