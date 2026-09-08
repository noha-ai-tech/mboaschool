"use client";

import { X } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";

type OverlayProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement>;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
};

function useAccessibleOverlay({
  open,
  onClose,
  panelRef,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement>;
  initialFocusRef?: RefObject<HTMLElement>;
}) {
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTarget =
      initialFocusRef?.current ??
      panelRef.current?.querySelector<HTMLElement>(
        '[data-autofocus], button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
    focusTarget?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [initialFocusRef, onClose, open, panelRef]);
}

function OverlayHeader({
  title,
  description,
  titleId,
  descriptionId,
  closeLabel,
  onClose,
}: {
  title: string;
  description?: string;
  titleId: string;
  descriptionId: string;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-[var(--school-admin-border)] px-5 py-4">
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="text-lg font-bold text-[var(--school-admin-text)]">
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className="mt-1 text-sm leading-6 text-[var(--school-admin-text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        data-autofocus
        onClick={onClose}
        aria-label={closeLabel}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--school-admin-text-muted)] transition hover:bg-[var(--school-admin-surface-muted)] hover:text-[var(--school-admin-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)] motion-reduce:transition-none"
      >
        <X size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

export function SchoolAdminDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  initialFocusRef,
  closeLabel = "Fermer la fenêtre",
  closeOnBackdrop = true,
}: OverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useAccessibleOverlay({ open, onClose, panelRef, initialFocusRef });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-label={closeOnBackdrop ? closeLabel : undefined}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="relative flex max-h-[min(88dvh,760px)] w-full max-w-xl flex-col overflow-hidden rounded-[var(--school-admin-radius-card)] border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] shadow-[var(--school-admin-shadow-lg)] outline-none"
      >
        <OverlayHeader title={title} description={description} titleId={titleId} descriptionId={descriptionId} closeLabel={closeLabel} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--school-admin-border)] px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SchoolAdminDrawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  initialFocusRef,
  closeLabel = "Fermer le panneau",
  closeOnBackdrop = true,
}: OverlayProps) {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useAccessibleOverlay({ open, onClose, panelRef, initialFocusRef });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-label={closeOnBackdrop ? closeLabel : undefined}
        tabIndex={-1}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-[min(92vw,560px)] flex-col bg-[var(--school-admin-surface)] shadow-[var(--school-admin-shadow-lg)] outline-none"
      >
        <OverlayHeader title={title} description={description} titleId={titleId} descriptionId={descriptionId} closeLabel={closeLabel} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--school-admin-border)] px-5 py-4">
            {footer}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
