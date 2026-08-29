// Emplacement partenaire — catégorie générique, jamais une marque réelle
// nommée sans accord (aucun partenariat n'existe encore). Étiquette "Bientôt
// disponible" toujours visible pour ne jamais laisser croire à un
// partenariat actif.
export function PartnerPlaceholder({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="bg-white border border-dashed border-[#E7E0D7] rounded-[18px] p-5 flex flex-col gap-3">
      <div className="w-10 h-10 rounded-xl bg-[#F4F3EF] flex items-center justify-center text-[#5A695F] font-bold text-xs" aria-hidden="true">
        {label.slice(0, 2).toUpperCase()}
      </div>
      <div>
        <p className="text-sm font-bold text-[#132019]">{label}</p>
        <p className="text-xs text-[#5A695F] mt-0.5 leading-relaxed">{description}</p>
      </div>
      <span className="self-start text-[10px] font-bold uppercase tracking-wider text-[#12543F] bg-[#E9F5EE] px-2 py-1 rounded-full">
        Bientôt disponible
      </span>
    </div>
  );
}
