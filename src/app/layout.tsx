import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'Vayil – Home Services Marketplace',
  description: 'Connect with trusted home service professionals. Get quotes, track projects, and pay securely.',
  themeColor: '#183954',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </head>
      <body>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#183954',
              color: '#fff',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 500,
            },
            success: { iconTheme: { primary: '#E8943A', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  )
}
