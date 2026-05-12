'use client'
import React, { useEffect, useState } from 'react'
import { customerApi } from '@/lib/api/client'
import { PageLoader, EmptyState } from '@/components/ui'
import { formatRelative } from '@/lib/utils'
import { Bell } from 'lucide-react'

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    customerApi.getNotifications()
      .then(r => {
        const d = r.data?.data || r.data?.result || []
        setNotifications(Array.isArray(d) ? d : [])
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h1 className="heading-lg">Notifications</h1>
        <p className="body-sm">{notifications.length} notifications</p>
      </div>
      {loading ? <PageLoader /> : notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="You're all caught up!" />
      ) : (
        <div className="space-y-2">
          {notifications.map((n: any, i: number) => (
            <div key={n.id || i} className={`card flex gap-4 ${!n.is_read ? 'border-orange-200 bg-orange-50/30' : ''}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${!n.is_read ? 'bg-orange-100' : 'bg-gray-100'}`}>
                <Bell className={`w-5 h-5 ${!n.is_read ? 'text-orange' : 'text-[var(--text-muted)]'}`} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-navy text-sm">{n.title}</p>
                {n.body && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{n.body}</p>}
                <p className="text-xs text-[var(--text-muted)] mt-1">{formatRelative(n.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
