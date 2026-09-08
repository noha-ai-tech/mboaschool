import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Activer une invitation | Écoles237",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

type ActivationPageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default async function ActivationInvitationPage({
  searchParams,
}: ActivationPageProps) {
  const { status } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Écoles237 Pro
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Activer une invitation
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Saisissez le code d’activation reçu par un canal de confiance.
        </p>

        {status === "invalid" ? (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            Impossible de préparer cette invitation. Vérifiez le code et réessayez.
          </p>
        ) : null}

        <form
          method="post"
          action="/auth/preparer-invitation"
          autoComplete="off"
          className="mt-6 space-y-4"
        >
          <label htmlFor="activation-code" className="block text-sm font-medium text-slate-800">
            Code d’activation
          </label>
          <input
            id="activation-code"
            name="token"
            type="password"
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
          >
            Continuer
          </button>
        </form>
      </section>
    </main>
  );
}
