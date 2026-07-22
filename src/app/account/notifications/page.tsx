'use client'
import React, { useEffect, useState } from 'react'
import { customerApi } from '@/lib/api/client'
import { PageLoader, EmptyState } from '@/components/ui'
import { formatRelative } from '@/lib/utils'
import { Bell } from 'lucide-react'
import { PageHero } from '@/components/shared/PageLayout'

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
    <div className="space-y-5">
      <PageHero title="Notifications" subtitle={`${notifications.length} notification${notifications.length !== 1 ? 's' : ''}`} />

      {loading ? <PageLoader /> : notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="You're all caught up!" />
      ) : (
        <div className="space-y-2">
          {notifications.map((n: any, i: number) => (
            <div key={n.id || i}
              className={`bg-white border rounded-2xl p-4 flex gap-4 ${!n.is_read ? 'border-orange/30 bg-orange/5' : 'border-gray-100'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${!n.is_read ? 'bg-orange/10' : 'bg-gray-100'}`}>
                <Bell className={`w-5 h-5 ${!n.is_read ? 'text-orange' : 'text-gray-400'}`} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-navy text-sm">{n.title}</p>
                {(n.body || n.description) && <p className="text-xs text-gray-500 mt-0.5">{n.body || n.description}</p>}
                <p className="text-xs text-gray-400 mt-1">{formatRelative(n.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
