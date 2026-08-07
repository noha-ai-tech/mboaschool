"use client";

import { supabase } from "@/lib/supabase";

export default function DeconnexionButton() {
  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="ml-auto text-xs text-slate-500 hover:text-white transition-colors"
    >
      Déconnexion
    </button>
  );
}
