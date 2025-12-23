import { Feature } from '@/store/app-store';

export type ColumnId = Feature['status'];

export const COLUMNS: { id: ColumnId; title: string; colorClass: string; columnClass?: string }[] =
  [
    { id: 'backlog', title: 'Backlog', colorClass: 'bg-white/20', columnClass: '' },
    {
      id: 'in_progress',
      title: 'In Progress',
      colorClass: 'bg-cyan-400',
      columnClass: 'col-in-progress',
    },
    {
      id: 'waiting_approval',
      title: 'Waiting Approval',
      colorClass: 'bg-amber-500',
      columnClass: 'col-waiting',
    },
    {
      id: 'verified',
      title: 'Verified',
      colorClass: 'bg-emerald-500',
      columnClass: 'col-verified',
    },
  ];
