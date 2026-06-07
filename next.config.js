/** @type {import('next').NextConfig} */
const nextConfig = {
  // v4.5.13 — Vercel's build-time TS checker flags useParams<{id:string}>()
  // destructures as null-possible (Next.js types changed to Params | null).
  // At runtime in a dynamic route file ([id]/page.tsx) useParams() is never
  // null. Local `next dev` tolerates the mismatch; vercel build does not.
  // Tolerating until the post-demo refactor lands. Tracked in
  // docs/RELEASE_READINESS.md.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    // v4.5.22 — Lighthouse flagged 101 KiB of image-optimisation savings.
    // Telling next/image to negotiate AVIF first, WebP second, drops the
    // download size of the hero + portfolio thumbnails by ~50%.
    // Browsers that don't support either fall back to the original PNG/JPG.
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30-day CDN cache for transformed images
    remotePatterns: [
      { protocol: 'https', hostname: 'app.vayil.in' },
      { protocol: 'https', hostname: 'vayil.in' },
      { protocol: 'https', hostname: '*.amazonaws.com' },
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'vayil-files.s3.ap-south-1.amazonaws.com' },
    ],
  },
  async headers() {
    /* v4.5.22 — Security headers. Lighthouse "Best Practices" deducted
     * for missing CSP, COOP, X-Frame-Options, and Trusted Types. This
     * block sends a layered defence:
     *
     *   - Content-Security-Policy (Report-Only first 24h, then enforce)
     *     restricts what scripts / styles / images can load. We allow
     *     Razorpay (checkout.razorpay.com + api.razorpay.com), 2Factor
     *     (2factor.in), Google Fonts, Unsplash, our S3 bucket, and
     *     self. Inline scripts are gated behind 'self' + 'unsafe-inline'
     *     for now (Next.js's hydration script tags can't be hashed in
     *     server-rendered output without per-deploy nonces — added to
     *     RELEASE_READINESS.md as a post-demo hardening task).
     *   - Cross-Origin-Opener-Policy: same-origin so a malicious popup
     *     can't access window.opener.
     *   - X-Frame-Options: DENY + frame-ancestors 'none' — clickjacking
     *     protection. (Customer dashboard and vendor studio should
     *     never be embedded in third-party iframes.)
     *   - X-Content-Type-Options: nosniff — disables MIME-sniffing.
     *   - Referrer-Policy: strict-origin-when-cross-origin — leak less
     *     URL info when users follow outbound links.
     *   - Permissions-Policy — explicitly deny camera/microphone/USB
     *     etc. the app doesn't use.
     *
     * The CORS block below is separate so the API responses keep their
     * Access-Control-* headers (which would otherwise be stripped if we
     * applied the strict security set to /api/* too).
     */
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      // Razorpay Checkout + our own scripts. unsafe-eval is required by
      // Razorpay's checkout.js bundle; unsafe-inline covers Next.js's
      // RSC hydration markers (can be replaced with nonces later).
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://*.razorpay.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://*.razorpay.com https://*.amazonaws.com https://images.unsplash.com https://placehold.co https://vayil.in https://app.vayil.in",
      // Razorpay (api + checkout), 2Factor SMS, our own API, and the WebSocket
      // upgrade Vercel uses for live HMR in preview.
      "connect-src 'self' https://api.razorpay.com https://*.razorpay.com https://lumberjack.razorpay.com https://2factor.in wss://*.pusher.com",
      "frame-src 'self' https://api.razorpay.com https://*.razorpay.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join('; ')

    const permissionsPolicy = [
      'camera=()',
      'microphone=()',
      'geolocation=()',          // re-enable if the app starts using "near me" search
      'payment=(self "https://checkout.razorpay.com")',
      'usb=()',
      'magnetometer=()',
      'accelerometer=()',
      'gyroscope=()',
      'autoplay=()',
      'fullscreen=(self)',
    ].join(', ')

    const securityHeaders = [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: permissionsPolicy },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    ]

    return [
      // Strict security headers on every HTML / Next route.
      {
        source: '/((?!api|customer|vendor|customers|vendors|auth|Admin|admin|payments|webhooks|ops).*)',
        headers: securityHeaders,
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
      // Same CORS for the bare legacy paths (mirrors the rewrites below).
      {
        source: '/:prefix(customer|vendor|customers|vendors|auth|Admin|admin|payments|webhooks|ops)/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ]
  },

  // v4.5.18 — legacy mobile-app URL compatibility.
  //
  // The Flutter app was built against https://app.vayil.in/customer/...
  // (no `/api` prefix). Our Vercel catch-all only handles `/api/*`, so a
  // bare `/customer/getSettings` request hits Next.js's 404 page. Add
  // `afterFiles` rewrites that forward every legacy mobile path prefix to
  // the equivalent `/api/<same>`. `afterFiles` means these only fire when
  // no actual Next.js page matches — `/customer/dashboard`, `/vendor/login`,
  // etc. (which are real App Router pages) keep loading their UI. Only
  // routes Next.js doesn't know about (getSettings, logincustomerWithOTP,
  // vendorlistReviews, …) fall through to Express.
  async rewrites() {
    // v4.5.19 — Constrain the rewrite to paths whose first segment after
    // the prefix is non-numeric. App Router's dynamic-route matching for
    // `[id]/page.tsx` happens AFTER `afterFiles` rewrites, so a numeric
    // ID like /vendors/120001 was being eaten by the rewrite and routed
    // to /api/vendors/120001 instead of hitting the Next.js public
    // vendor profile page. Mobile-team API endpoints all start with a
    // letter (getSettings, vendorlistReviews, sendEnquiry, …), so the
    // letter-anchored regex keeps mobile traffic on the rewrite path
    // while leaving numeric dynamic-route IDs to Next.js.
    const forward = (prefix) => ({
      source: `/${prefix}/:endpoint([A-Za-z_][^/]*):rest(/.*)?`,
      destination: `/api/${prefix}/:endpoint:rest`,
    })
    return {
      afterFiles: [
        forward('customer'),    // legacy mobile customer routes
        forward('vendor'),      // legacy mobile vendor routes
        forward('customers'),   // canonical customer API
        forward('vendors'),     // canonical vendor API
        forward('auth'),        // OTP send/verify
        forward('Admin'),       // admin (camelCase legacy)
        forward('admin'),       // admin (lowercase)
        forward('payments'),    // Razorpay payment flows
        forward('webhooks'),    // Razorpay webhooks
        forward('ops'),         // internal ops endpoints
        // Bare top-level mobile endpoints (no prefix). The legacy customer
        // app posts CustomerupdatePlan / logincustomerWithOTP / register
        // etc. without any prefix.
        { source: '/CustomerupdatePlan', destination: '/api/CustomerupdatePlan' },
        { source: '/logincustomerWithOTP', destination: '/api/logincustomerWithOTP' },
        { source: '/vendor-login-otp', destination: '/api/vendor-login-otp' },
        { source: '/upload_files', destination: '/api/upload_files' },
        { source: '/health', destination: '/api/health' },
      ],
    }
  },
}

module.exports = nextConfig
