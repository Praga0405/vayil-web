import CustomerLayout from '@/components/shared/CustomerLayout'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <CustomerLayout>{children}</CustomerLayout>
}
