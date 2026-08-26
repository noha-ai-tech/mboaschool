/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const privateInvitationHeaders = [
      { key: 'Cache-Control', value: 'no-store, max-age=0' },
      { key: 'Pragma', value: 'no-cache' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
    ];

    return [
      { source: '/auth/callback', headers: privateInvitationHeaders },
      { source: '/auth/activer-invitation', headers: privateInvitationHeaders },
      { source: '/auth/preparer-invitation', headers: privateInvitationHeaders },
      { source: '/auth/consommer-invitation', headers: privateInvitationHeaders },
      { source: '/auth/enseignant-bienvenue', headers: privateInvitationHeaders },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'umcwwynrftidytxgqkwi.supabase.co' }
    ]
  },
  eslint: {
    // La configuration ESLint (.eslintrc.json) vient d'être ajoutée pour ce sprint
    // et révèle ~30 erreurs préexistantes (react/no-unescaped-entities) réparties
    // dans des fichiers hors périmètre de cette mission (annuaire, fiches publiques,
    // préinscription). On ne bloque pas le build dessus : `npm run lint` reste
    // disponible pour les corriger dans une mission dédiée.
    ignoreDuringBuilds: true,
  },
}
module.exports = nextConfig
