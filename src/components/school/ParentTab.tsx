import Link from "next/link";
import { ClipboardList, GraduationCap, Bell, FileText } from "lucide-react";

export function ParentTab({ schoolId }: { schoolId: string }) {
  const cards = [
    { icon: ClipboardList, title: "Dossier de l'enfant",  text: "Statut d'admission, pièces manquantes, décision de l'école." },
    { icon: GraduationCap,  title: "Classe assignée",     text: "Classe, enseignant, annonces et documents de classe." },
    { icon: Bell,           title: "Messages école",      text: "Communiqués, rappels, réunions et urgences." },
    { icon: FileText,       title: "Documents & frais",   text: "Reçus, frais à payer, calendrier et documents scolaires." },
  ];

  return (
    <div id="admissions" className="bg-accent text-white rounded-card p-6 scroll-mt-20">
      <h2 className="font-black text-2xl mb-2">Admissions</h2>
      <p className="text-white/60 text-sm mb-6 leading-relaxed">
        Préinscrivez votre enfant en ligne. Une fois le dossier accepté, cet
        espace devient le lien entre le parent, l&apos;élève et l&apos;école.
      </p>
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        {cards.map(({ icon: Icon, title, text }) => (
          <div key={title} className="bg-white/5 rounded-xl p-4 border border-white/8">
            <Icon size={15} className="text-primary-light mb-3" />
            <h3 className="font-bold text-sm text-white mb-1">{title}</h3>
            <p className="text-xs text-white/60 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
      <Link
        href={`/preinscription?ecole=${schoolId}`}
        className="inline-block bg-[#FCD116] text-[#0A0A0A] px-5 py-2.5 rounded-card text-sm font-bold hover:bg-[#FCD116]/90 transition-colors duration-base"
      >
        Préinscrire mon enfant
      </Link>
    </div>
  );
}
