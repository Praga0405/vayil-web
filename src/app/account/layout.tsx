'use client'
import AccountLayout from '@/components/shared/AccountLayout'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AccountLayout>{children}</AccountLayout>
}
