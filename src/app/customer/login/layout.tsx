// Auth pages bypass the customer sidebar layout
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
