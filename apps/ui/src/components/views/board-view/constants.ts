import { Feature } from '@/store/app-store';

export type ColumnId = Feature['status'];

export const COLUMNS: { id: ColumnId; title: string; colorClass: string }[] = [
  { id: 'backlog', title: 'Backlog', colorClass: 'bg-[var(--status-backlog)]' },
  {
    id: 'in_progress',
    title: 'In Progress',
    colorClass: 'bg-[var(--status-in-progress)]',
  },
  {
    id: 'double_check',
    title: 'Double-Check',
    colorClass: 'bg-[var(--status-double-check)]',
  },
  {
    id: 'waiting_approval',
    title: 'Waiting Approval',
    colorClass: 'bg-[var(--status-waiting)]',
  },
  {
    id: 'verified',
    title: 'Verified',
    colorClass: 'bg-[var(--status-success)]',
  },
];
