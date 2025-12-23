import { Feature } from '@/store/app-store';

export type ColumnId = Feature['status'];

export const COLUMNS: {
  id: ColumnId;
  title: string;
  colorClass: string;
  accent: 'cyan' | 'blue' | 'orange' | 'green';
}[] = [
  { id: 'backlog', title: 'Backlog', colorClass: 'bg-[var(--status-backlog)]', accent: 'cyan' },
  {
    id: 'in_progress',
    title: 'In Progress',
    colorClass: 'bg-[var(--status-in-progress)]',
    accent: 'blue',
  },
  {
    id: 'waiting_approval',
    title: 'Waiting Approval',
    colorClass: 'bg-[var(--status-waiting)]',
    accent: 'orange',
  },
  {
    id: 'verified',
    title: 'Verified',
    colorClass: 'bg-[var(--status-success)]',
    accent: 'green',
  },
];
