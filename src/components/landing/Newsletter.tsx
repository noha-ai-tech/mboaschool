"use client";

import { useState } from "react";

// Bloc newsletter du footer — aucune infrastructure d'envoi n'existe encore
// côté produit (pas de table, pas de service email) et cette mission
// n'autorise pas de changement Supabase. On ne simule donc jamais une
// inscription réussie : la confirmation reste honnête ("bientôt
// disponible"), jamais un faux "vous êtes inscrit".
export function Newsletter() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <div>
      <p className="font-bold text-white text-base mb-1">Restez informé</p>
      <p className="text-sm text-white/60 mb-4">Les nouveautés Écoles237, sans spam.</p>

      {submitted ? (
        <p className="text-sm text-[#FCD116] font-medium">Merci ! Cette fonctionnalité arrive bientôt.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email) setSubmitted(true);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="votre@email.com"
            className="flex-1 min-w-0 h-11 px-4 rounded-[10px] bg-white/10 border border-white/15 text-white text-sm placeholder:text-white/40 outline-none focus:border-white/40 transition-colors duration-base"
          />
          <button
            type="submit"
            className="shrink-0 h-11 px-5 rounded-[10px] bg-white text-primary text-sm font-bold hover:bg-white/90 transition-colors duration-base"
          >
            S&apos;abonner
          </button>
        </form>
      )}
    </div>
  );
}
