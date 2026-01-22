import { useState, useEffect, useCallback } from 'react';
import { Clock, CalendarClock, RefreshCw, Calendar, Timer } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { FeatureSchedule, SchedulePreset } from '@automaker/types';

interface ScheduleSelectorProps {
  value: FeatureSchedule | undefined | null;
  onChange: (schedule: FeatureSchedule | null) => void;
  disabled?: boolean;
  testIdPrefix?: string;
}

const SCHEDULE_PRESETS: Record<Exclude<SchedulePreset, 'custom'>, string> = {
  hourly: '0 * * * *',
  daily: '0 9 * * *',
  weekly: '0 9 * * 1',
  monthly: '0 9 1 * *',
};

const PRESET_OPTIONS = [
  {
    value: 'none' as const,
    label: 'No Schedule',
    description: 'Feature runs once',
    icon: Clock,
    color: 'text-muted-foreground',
  },
  {
    value: 'hourly' as const,
    label: 'Hourly',
    description: 'Every hour at :00',
    icon: Timer,
    color: 'text-blue-500',
  },
  {
    value: 'daily' as const,
    label: 'Daily',
    description: 'Every day at 9:00 AM',
    icon: CalendarClock,
    color: 'text-green-500',
  },
  {
    value: 'weekly' as const,
    label: 'Weekly',
    description: 'Every Monday at 9:00 AM',
    icon: Calendar,
    color: 'text-purple-500',
  },
  {
    value: 'monthly' as const,
    label: 'Monthly',
    description: '1st of each month at 9:00 AM',
    icon: RefreshCw,
    color: 'text-amber-500',
  },
  {
    value: 'custom' as const,
    label: 'Custom',
    description: 'Enter a crontab expression',
    icon: Clock,
    color: 'text-cyan-500',
  },
];

/**
 * Get human-readable description of a crontab expression
 */
function describeCrontab(crontab: string): string {
  const parts = crontab.trim().split(/\s+/);
  if (parts.length !== 5) return 'Invalid crontab format';

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Check against known presets
  if (crontab === SCHEDULE_PRESETS.hourly) return 'Every hour at :00';
  if (crontab === SCHEDULE_PRESETS.daily) return 'Every day at 9:00 AM';
  if (crontab === SCHEDULE_PRESETS.weekly) return 'Every Monday at 9:00 AM';
  if (crontab === SCHEDULE_PRESETS.monthly) return '1st of each month at 9:00 AM';

  // Build description for custom crontabs
  let desc = '';

  // Check for common patterns
  if (minute === '0' && hour === '*') {
    desc = 'Every hour';
  } else if (minute === '*' && hour === '*') {
    desc = 'Every minute';
  } else if (hour !== '*' && minute !== '*') {
    const hourNum = parseInt(hour, 10);
    const minuteNum = parseInt(minute, 10);
    if (!isNaN(hourNum) && !isNaN(minuteNum)) {
      const ampm = hourNum >= 12 ? 'PM' : 'AM';
      const hour12 = hourNum % 12 || 12;
      const minStr = minuteNum.toString().padStart(2, '0');
      desc = `At ${hour12}:${minStr} ${ampm}`;
    }
  }

  if (dayOfWeek !== '*' && dayOfWeek !== '?') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayNum = parseInt(dayOfWeek, 10);
    if (!isNaN(dayNum) && dayNum >= 0 && dayNum <= 6) {
      desc += ` on ${days[dayNum]}`;
    }
  }

  if (dayOfMonth !== '*' && dayOfMonth !== '?') {
    const day = parseInt(dayOfMonth, 10);
    if (!isNaN(day)) {
      const suffix = day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th';
      desc += ` on the ${day}${suffix}`;
    }
  }

  if (month !== '*') {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const monthNum = parseInt(month, 10);
    if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
      desc += ` in ${months[monthNum - 1]}`;
    }
  }

  return desc || `Cron: ${crontab}`;
}

/**
 * Detect which preset matches a crontab, or 'custom' if none match
 */
function detectPreset(crontab: string | undefined): SchedulePreset | 'none' {
  if (!crontab) return 'none';

  for (const [preset, value] of Object.entries(SCHEDULE_PRESETS)) {
    if (value === crontab) {
      return preset as SchedulePreset;
    }
  }
  return 'custom';
}

/**
 * Validate a crontab expression (basic validation)
 */
function validateCrontab(crontab: string): { valid: boolean; error?: string } {
  const parts = crontab.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { valid: false, error: 'Crontab must have 5 fields (minute hour day month weekday)' };
  }

  const ranges = [
    { min: 0, max: 59, name: 'minute' },
    { min: 0, max: 23, name: 'hour' },
    { min: 1, max: 31, name: 'day' },
    { min: 1, max: 12, name: 'month' },
    { min: 0, max: 6, name: 'weekday' },
  ];

  for (let i = 0; i < 5; i++) {
    const part = parts[i];
    const range = ranges[i];

    if (part === '*') continue;

    // Handle ranges like 1-5
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (isNaN(start) || isNaN(end) || start < range.min || end > range.max || start > end) {
        return { valid: false, error: `Invalid ${range.name} range: ${part}` };
      }
      continue;
    }

    // Handle step values like */5
    if (part.includes('/')) {
      const [base, step] = part.split('/');
      if (base !== '*' && isNaN(Number(base))) {
        return { valid: false, error: `Invalid ${range.name} step base: ${part}` };
      }
      if (isNaN(Number(step)) || Number(step) <= 0) {
        return { valid: false, error: `Invalid ${range.name} step: ${part}` };
      }
      continue;
    }

    // Handle lists like 1,3,5
    if (part.includes(',')) {
      const values = part.split(',').map(Number);
      for (const val of values) {
        if (isNaN(val) || val < range.min || val > range.max) {
          return { valid: false, error: `Invalid ${range.name} value in list: ${val}` };
        }
      }
      continue;
    }

    // Single value
    const num = Number(part);
    if (isNaN(num) || num < range.min || num > range.max) {
      return {
        valid: false,
        error: `Invalid ${range.name}: ${part} (must be ${range.min}-${range.max})`,
      };
    }
  }

  return { valid: true };
}

export function ScheduleSelector({
  value,
  onChange,
  disabled = false,
  testIdPrefix = 'schedule',
}: ScheduleSelectorProps) {
  const [preset, setPreset] = useState<SchedulePreset | 'none'>(() => detectPreset(value?.crontab));
  const [customCrontab, setCustomCrontab] = useState(
    preset === 'custom' ? (value?.crontab ?? '') : ''
  );
  const [validationError, setValidationError] = useState<string | undefined>();

  // Update local state when value changes from outside
  useEffect(() => {
    const detectedPreset = detectPreset(value?.crontab);
    setPreset(detectedPreset);
    if (detectedPreset === 'custom' && value?.crontab) {
      setCustomCrontab(value.crontab);
    }
  }, [value?.crontab]);

  const handlePresetChange = useCallback(
    (newPreset: SchedulePreset | 'none') => {
      setPreset(newPreset);
      setValidationError(undefined);

      if (newPreset === 'none') {
        // Use null instead of undefined so it survives JSON serialization
        // and the server can detect that schedule is being explicitly removed
        onChange(null);
        return;
      }

      // Preserve existing keepPriorContext value, default to true for new schedules
      const keepPriorContext = value?.keepPriorContext ?? true;

      if (newPreset === 'custom') {
        // Use existing crontab or default to midnight daily (0 0 * * *)
        // Note: Using 0 0 instead of 0 * to avoid matching the 'hourly' preset
        const crontabToUse = customCrontab || '0 0 * * *';
        setCustomCrontab(crontabToUse);
        const validation = validateCrontab(crontabToUse);
        if (validation.valid) {
          onChange({
            crontab: crontabToUse,
            enabled: true,
            keepPriorContext,
          });
        } else {
          setValidationError(validation.error);
        }
        return;
      }

      // Set preset crontab
      const crontab = SCHEDULE_PRESETS[newPreset];
      onChange({
        crontab,
        enabled: true,
        keepPriorContext,
      });
    },
    [onChange, customCrontab, value?.keepPriorContext]
  );

  const handleCustomCrontabChange = useCallback(
    (crontab: string) => {
      setCustomCrontab(crontab);

      if (!crontab.trim()) {
        setValidationError(undefined);
        return;
      }

      const validation = validateCrontab(crontab);
      if (validation.valid) {
        setValidationError(undefined);
        onChange({
          crontab,
          enabled: true,
          keepPriorContext: value?.keepPriorContext ?? true,
        });
      } else {
        setValidationError(validation.error);
      }
    },
    [onChange, value?.keepPriorContext]
  );

  const handleKeepPriorContextChange = useCallback(
    (keepPriorContext: boolean) => {
      if (!value) return;
      onChange({
        ...value,
        keepPriorContext,
      });
    },
    [onChange, value]
  );

  const selectedOption = PRESET_OPTIONS.find((o) => o.value === preset);
  const currentCrontab =
    preset === 'custom' ? customCrontab : preset !== 'none' ? SCHEDULE_PRESETS[preset] : undefined;

  return (
    <div className="space-y-3">
      {/* Preset Selector */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Recurring Schedule</Label>
        <Select
          value={preset}
          onValueChange={(value) => handlePresetChange(value as SchedulePreset | 'none')}
          disabled={disabled}
        >
          <SelectTrigger className="h-9" data-testid={`${testIdPrefix}-preset-trigger`}>
            <SelectValue>
              {selectedOption && (
                <div className="flex items-center gap-2">
                  <selectedOption.icon className={cn('h-4 w-4', selectedOption.color)} />
                  <span>{selectedOption.label}</span>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PRESET_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  data-testid={`${testIdPrefix}-option-${option.value}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-3.5 w-3.5', option.color)} />
                    <span>{option.label}</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      - {option.description}
                    </span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Custom Crontab Input */}
      {preset === 'custom' && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Crontab Expression</Label>
          <Input
            value={customCrontab}
            onChange={(e) => handleCustomCrontabChange(e.target.value)}
            placeholder="* * * * * (min hour day month weekday)"
            disabled={disabled}
            className={cn(validationError && 'border-red-500')}
            data-testid={`${testIdPrefix}-crontab-input`}
          />
          {validationError && <p className="text-xs text-red-500">{validationError}</p>}
          <p className="text-xs text-muted-foreground">
            Format: minute (0-59) hour (0-23) day (1-31) month (1-12) weekday (0-6, Sun=0)
          </p>
        </div>
      )}

      {/* Schedule Preview */}
      {preset !== 'none' && currentCrontab && !validationError && (
        <div className="flex items-center rounded-md bg-muted/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{describeCrontab(currentCrontab)}</span>
          </div>
        </div>
      )}

      {/* Keep Prior Context Toggle */}
      {preset !== 'none' && !validationError && (
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div className="space-y-0.5">
            <Label htmlFor="keep-prior-context" className="text-sm font-medium">
              Keep prior context
            </Label>
            <p className="text-xs text-muted-foreground">
              When off, agent output is cleared before each scheduled run
            </p>
          </div>
          <Switch
            id="keep-prior-context"
            checked={value?.keepPriorContext ?? true}
            onCheckedChange={handleKeepPriorContextChange}
            disabled={disabled}
            data-testid={`${testIdPrefix}-keep-prior-context`}
          />
        </div>
      )}

      {/* Last/Next Run Info */}
      {value?.lastRun && (
        <p className="text-xs text-muted-foreground">
          Last run: {new Date(value.lastRun).toLocaleString()}
          {value.runCount !== undefined && ` (${value.runCount} runs)`}
        </p>
      )}
      {value?.nextRun && value.enabled && (
        <p className="text-xs text-muted-foreground">
          Next run: {new Date(value.nextRun).toLocaleString()}
        </p>
      )}
    </div>
  );
}
