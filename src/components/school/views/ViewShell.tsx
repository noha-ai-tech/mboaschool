"use client";

// GUYSKULL-05 — shared layout/sub-navigation primitives used by the
// non-Accueil views (each is now its own routed page, but keeps the same
// desktop sidebar / mobile pill sub-navigation for its internal sections).
export function ViewShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-8 flex flex-col lg:flex-row gap-8 items-start">
      {children}
    </div>
  );
}

export function ViewContextMenu({ items }: { items: ({ id: string; label: string } | null)[] }) {
  const visible = items.filter(Boolean) as { id: string; label: string }[];
  if (visible.length === 0) return null;

  function scrollToId(anchor: string) {
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <nav aria-label="Sections de la page" className="hidden lg:block w-[200px] shrink-0 sticky top-[88px] space-y-1">
        {visible.map((item) => (
          <button
            key={item.id}
            onClick={() => scrollToId(item.id)}
            className="block w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-white transition-colors duration-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {item.label}
          </button>
        ))}
      </nav>
      <nav aria-label="Sections de la page (mobile)" className="lg:hidden -mt-2 mb-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden w-full">
        {visible.map((item) => (
          <button
            key={item.id}
            onClick={() => scrollToId(item.id)}
            className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white border border-border text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {item.label}
          </button>
        ))}
      </nav>
    </>
  );
}

export function EmptyViewNote() {
  return (
    <div className="bg-white border border-border rounded-card py-14 text-center">
      <p className="text-sm text-text-secondary">Aucune information publiée dans cette section pour le moment.</p>
    </div>
  );
}
