import { Users, GraduationCap, Trophy, Award, CalendarDays } from "lucide-react";

// PUBLIC-SITE-01 §4B — key numbers row. No source table for
// students/teachers/success-rate/ranking/founding-year exists yet
// (confirmed during audit — establishments has no such columns, and no
// statistics table exists). Per the mission ("Do NOT invent values ...
// hide that card"), every stat is optional and the whole section renders
// nothing when none are available — never a fabricated number.
export type KeyNumber = { icon: typeof Users; label: string; value: string };

export function MiniSiteKeyNumbers({
  studentsCount,
  teachersCount,
  successRatePercent,
  officialRanking,
  foundingYear,
}: {
  studentsCount?: number | null;
  teachersCount?: number | null;
  successRatePercent?: number | null;
  officialRanking?: string | null;
  foundingYear?: number | null;
}) {
  const stats: KeyNumber[] = [
    studentsCount != null ? { icon: Users, label: "Élèves", value: studentsCount.toLocaleString("fr-FR") } : null,
    teachersCount != null ? { icon: GraduationCap, label: "Enseignants", value: teachersCount.toLocaleString("fr-FR") } : null,
    successRatePercent != null ? { icon: Trophy, label: "Taux de réussite", value: `${successRatePercent}%` } : null,
    officialRanking ? { icon: Award, label: "Classement", value: officialRanking } : null,
    foundingYear != null ? { icon: CalendarDays, label: "Fondé en", value: String(foundingYear) } : null,
  ].filter(Boolean) as KeyNumber[];

  if (stats.length === 0) return null;

  // Tailwind can't resolve interpolated class names at build time, so the
  // grid column count needs an explicit static map rather than a template
  // literal (`grid-cols-${n}` would never be generated).
  const gridClass: Record<number, string> = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
    5: "grid-cols-2 sm:grid-cols-5",
  };

  return (
    <div className={`grid gap-3 ${gridClass[stats.length]}`}>
      {stats.map((stat) => (
        <div key={stat.label} className="bg-white border border-border rounded-card p-4 text-center">
          <stat.icon size={18} className="mx-auto text-primary mb-2" />
          <p className="font-black text-lg text-text-primary leading-none">{stat.value}</p>
          <p className="text-[11px] text-text-secondary mt-1.5">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
