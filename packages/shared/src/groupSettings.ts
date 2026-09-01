import { z } from 'zod';

/**
 * groups.settings (jsonb). Ver specs/02-design.md §3.2 y RF-17.
 * Se valida con Zod al escribir porque la lista de settings va a crecer (D5, D6)
 * y no queremos una migración por cada toggle nuevo.
 */
const groupSettingsObject = z.object({
  period_types: z.array(z.enum(['week', 'month'])).min(1),
  primary_period: z.enum(['week', 'month']),
  absence_policy: z.enum(['penalize', 'ignore']),
  scoring_mode: z.enum(['total_time', 'position_points']),
  position_points: z.array(z.number().int().min(0)).min(1).max(20),
  drop_worst_n: z.number().int().min(0).max(5),
  edit_window_hours: z.number().int().min(1).max(24 * 14),
  require_verified: z.boolean(),
  timezone: z.string().min(1),
});

export const groupSettingsSchema = groupSettingsObject.refine(
  (s) => s.period_types.includes(s.primary_period),
  { message: 'El período principal tiene que estar entre los períodos activos', path: ['primary_period'] },
);

/** Para PATCH: cualquier subconjunto de campos. La consistencia cruzada se revisa después del merge. */
export const groupSettingsPatchSchema = groupSettingsObject.partial();

export type GroupSettings = z.infer<typeof groupSettingsObject>;

export const defaultGroupSettings: GroupSettings = {
  period_types: ['month', 'week'],
  primary_period: 'month',
  absence_policy: 'penalize',
  scoring_mode: 'total_time',
  position_points: [5, 3, 2, 1],
  drop_worst_n: 0,
  edit_window_hours: 48,
  require_verified: false,
  timezone: 'America/Argentina/Buenos_Aires',
};
