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
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'umcwwynrftidytxgqkwi.supabase.co' }
    ]
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}
module.exports = nextConfig