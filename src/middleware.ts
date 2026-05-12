import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const CUSTOMER_PUBLIC = ['/customer/login', '/customer/signup', '/customer/otp']
const VENDOR_PUBLIC   = ['/vendor/login', '/vendor/signup', '/vendor/otp', '/vendor/onboarding']
const PUBLIC          = ['/', '/about', '/terms', '/privacy', '/contact']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow fully public paths
  if (PUBLIC.some(p => pathname === p || pathname.startsWith('/api/'))) {
    return NextResponse.next()
  }

  // Customer portal
  if (pathname.startsWith('/customer')) {
    if (CUSTOMER_PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next()
    const tok = request.cookies.get('vayil_token')?.value
      || request.headers.get('x-vayil-token')
    if (!tok) return NextResponse.redirect(new URL('/customer/login', request.url))
  }

  // Vendor portal
  if (pathname.startsWith('/vendor')) {
    if (VENDOR_PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next()
    const tok = request.cookies.get('vayil_token')?.value
      || request.headers.get('x-vayil-token')
    if (!tok) return NextResponse.redirect(new URL('/vendor/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/customer/:path*', '/vendor/:path*'],
}
