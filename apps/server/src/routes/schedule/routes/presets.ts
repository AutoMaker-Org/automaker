/**
 * GET /schedule/presets endpoint - Get available schedule presets
 *
 * Returns the standard preset crontab expressions.
 */

import type { Request, Response } from 'express';
import type { SchedulePreset } from '@automaker/types';

export interface PresetInfo {
  id: SchedulePreset;
  label: string;
  crontab: string;
  description: string;
}

export interface PresetsResponse {
  presets: PresetInfo[];
}

const SCHEDULE_PRESETS: PresetInfo[] = [
  {
    id: 'hourly',
    label: 'Hourly',
    crontab: '0 * * * *',
    description: 'Run at the start of every hour',
  },
  {
    id: 'daily',
    label: 'Daily',
    crontab: '0 9 * * *',
    description: 'Run every day at 9:00 AM',
  },
  {
    id: 'weekly',
    label: 'Weekly',
    crontab: '0 9 * * 1',
    description: 'Run every Monday at 9:00 AM',
  },
  {
    id: 'monthly',
    label: 'Monthly',
    crontab: '0 9 1 * *',
    description: 'Run on the 1st of every month at 9:00 AM',
  },
];

export function createPresetsHandler() {
  return (_req: Request, res: Response): void => {
    res.json({
      presets: SCHEDULE_PRESETS,
    } satisfies PresetsResponse);
  };
}
