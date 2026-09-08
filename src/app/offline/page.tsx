import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

// OFFLINE-01 Phase 7 — page de repli servie par le service worker quand une
// navigation échoue faute de réseau. Volontairement statique et minimale :
// aucune donnée privée, aucun appel réseau.

export const metadata: Metadata = {
  title: "Hors connexion",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#ECECEA] px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-white border border-border flex items-center justify-center mb-5">
        <WifiOff size={24} className="text-text-secondary" />
      </div>
      <h1 className="text-xl font-bold text-text-primary mb-2">Vous êtes hors connexion</h1>
      <p className="text-sm text-text-secondary max-w-sm">
        Cette page n&apos;est pas disponible sans connexion Internet. Vos saisies déjà enregistrées sur cet appareil seront synchronisées automatiquement au retour du réseau.
      </p>
    </main>
  );
}
