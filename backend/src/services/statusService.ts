export type LegacyStatusRow = {
  id: number;
  status_name: string;
  is_active: number;
  created_at: string;
};

const LEGACY_STATUS_ROWS: LegacyStatusRow[] = [
  { id: 1, status_name: 'Pending', is_active: 1, created_at: '2026-01-03T06:51:52.000Z' },
  { id: 2, status_name: 'Accepted', is_active: 1, created_at: '2026-01-03T06:51:52.000Z' },
  { id: 3, status_name: 'Rejected', is_active: 1, created_at: '2026-01-03T06:51:53.000Z' },
  { id: 4, status_name: 'In Progress', is_active: 1, created_at: '2026-01-20T11:58:53.000Z' },
  { id: 5, status_name: 'Paid', is_active: 1, created_at: '2026-01-20T11:58:53.000Z' },
  { id: 6, status_name: 'Partial Completion', is_active: 1, created_at: '2026-01-20T11:58:54.000Z' },
  { id: 7, status_name: 'Verify', is_active: 1, created_at: '2026-01-20T11:58:54.000Z' },
  { id: 8, status_name: 'Need Payment', is_active: 1, created_at: '2026-01-20T11:58:54.000Z' },
  { id: 9, status_name: 'Ongoing', is_active: 1, created_at: '2026-01-20T11:58:54.000Z' },
  { id: 10, status_name: 'Completed', is_active: 1, created_at: '2026-01-20T11:58:54.000Z' },
  { id: 11, status_name: 'Quote Received', is_active: 1, created_at: '2026-01-20T12:45:17.000Z' },
  { id: 12, status_name: 'Need Verify', is_active: 1, created_at: '2026-01-23T05:54:04.000Z' },
  { id: 13, status_name: 'Verified', is_active: 1, created_at: '2026-01-23T05:54:04.000Z' },
];

export function legacyStatusRows(): LegacyStatusRow[] {
  return LEGACY_STATUS_ROWS.map((row) => ({ ...row }));
}

export function legacyStatusName(status: unknown): string | null {
  const id = Number(status);
  if (!Number.isFinite(id)) return null;
  return LEGACY_STATUS_ROWS.find((row) => row.id === Math.trunc(id))?.status_name ?? null;
}
