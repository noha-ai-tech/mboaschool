import Link from "next/link";
import { X } from "lucide-react";

type ComparisonSchool = {
  id: string;
  name: string;
  city?: string | null;
  region?: string | null;
  fees?: { registration_fee?: number | null; tuition_fee?: number | null }[] | null;
};

const feeRows = [
  { key: "registration_fee", label: "Inscription" },
  { key: "tuition_fee", label: "Scolarité / an" },
] as const;

export function CategoryComparison({ schools, onRemove, onClose }: {
  schools: ComparisonSchool[];
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <section id="category-comparison" aria-label="Comparaison des établissements" className="bg-white border border-[#E7E0D7] rounded-[16px] p-4 mb-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-semibold text-[#132019]">Comparer les établissements</h2>
        <button type="button" onClick={onClose} aria-label="Fermer la comparaison" className="p-2"><X size={18} /></button>
      </div>
      {schools.length === 0 ? (
        <p className="text-sm text-[#5A695F]">Cochez « Comparer » sur les cartes de deux ou trois établissements.</p>
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tableau comparatif défilant">
          <table className="w-full text-sm text-left text-[#132019]">
            <caption className="text-left text-xs text-[#5A695F] pb-3">{schools.length}/3 établissements sélectionnés</caption>
            <thead>
              <tr>
                <th scope="col" className="p-3">Établissement</th>
                {schools.map((school) => (
                  <th scope="col" key={school.id} className="p-3 min-w-[180px]">
                    <Link className="text-[#12543F] hover:underline" href={`/ecole/${school.id}`}>{school.name}</Link>
                    <button type="button" onClick={() => onRemove(school.id)} aria-label={`Retirer ${school.name} de la comparaison`} className="block mt-2 text-xs font-normal underline">Retirer</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[#E7E0D7]">
                <th scope="row" className="p-3">Ville</th>
                {schools.map((school) => <td key={school.id} className="p-3">{school.city || "Non renseignée"}</td>)}
              </tr>
              <tr className="border-t border-[#E7E0D7]">
                <th scope="row" className="p-3">Région</th>
                {schools.map((school) => <td key={school.id} className="p-3">{school.region || "Non renseignée"}</td>)}
              </tr>
              {feeRows.map((row) => (
                <tr key={row.key} className="border-t border-[#E7E0D7]">
                  <th scope="row" className="p-3">{row.label}</th>
                  {schools.map((school) => {
                    const amount = school.fees?.[0]?.[row.key];
                    return <td key={school.id} className="p-3">{amount != null && amount > 0 ? `${Number(amount).toLocaleString("fr-FR")} FCFA` : "Non renseignés"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
