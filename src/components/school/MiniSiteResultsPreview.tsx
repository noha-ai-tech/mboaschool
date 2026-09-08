import { Trophy, Award } from "lucide-react";
import { resultsVocabularyForCategory } from "@/lib/schoolPage/category";

// PUBLIC-SITE-01 §4D / §7 — exam results + official ranking. No results or
// ranking table exists yet (audited: no such schema). Per the mission's
// explicit rule ("do not fabricate MINESEC rankings" — a ranking shown as
// official needs source/year/rank/scope), this renders nothing until that
// data genuinely exists. Kept as its own component (rather than skipped
// entirely) so a future data source only needs to pass props here — the
// category-aware exam vocabulary is already wired up.
export type ExamResult = { examLabel: string; year: number; successRatePercent: number; admittedCount?: number; totalCount?: number };
export type OfficialRanking = { source: string; year: number; rank: string; scope: string };

export function MiniSiteResultsPreview({
  category,
  results,
  ranking,
}: {
  category: string | null;
  results: ExamResult[];
  ranking: OfficialRanking | null;
}) {
  if (results.length === 0 && !ranking) return null;

  const { title } = resultsVocabularyForCategory(category);

  return (
    <div id="resultats" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
      <h2 className="font-bold text-sm mb-4 flex items-center gap-2">
        <Trophy size={15} className="text-primary" /> {title}
      </h2>

      {results.length > 0 && (
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          {results.map((r) => (
            <div key={`${r.examLabel}-${r.year}`} className="bg-muted rounded-xl p-4">
              <p className="text-xs font-bold text-text-secondary">{r.examLabel} {r.year}</p>
              <p className="font-black text-2xl text-primary mt-1">{r.successRatePercent}%</p>
              {r.admittedCount != null && r.totalCount != null && (
                <p className="text-[11px] text-text-secondary mt-1">{r.admittedCount} admis / {r.totalCount}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {ranking && (
        <div className="flex items-start gap-2.5 bg-accent/5 border border-accent/15 rounded-xl p-4">
          <Award size={16} className="text-accent shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-text-primary">{ranking.rank}</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Classement {ranking.source} {ranking.year} — {ranking.scope}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
