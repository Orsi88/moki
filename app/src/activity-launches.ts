// Requests sent by this app, kept separately from the actual project run state.
export type ActivityLaunchPhase = 'sending' | 'sent' | 'prepared' | 'failed' | 'unconfirmed';
export interface ActivityLaunch { id: string; activity: string; label: string; at: string; phase: ActivityLaunchPhase }

export function parseActivityLaunches(value: string | null): ActivityLaunch[] {
  try {
    const items: unknown = JSON.parse(value ?? '[]');
    if (!Array.isArray(items)) return [];
    return items.filter((item): item is ActivityLaunch => Boolean(item) && typeof item === 'object'
      && typeof item.id === 'string' && /^[a-f0-9]{32}$/.test(item.id)
      && typeof item.activity === 'string' && typeof item.label === 'string' && typeof item.at === 'string'
      && ['sending', 'sent', 'prepared', 'failed', 'unconfirmed'].includes(item.phase))
      .map((item) => item.phase === 'sending' ? { ...item, phase: 'unconfirmed' } : item);
  } catch { return []; }
}

export const launchForRun = (id: string, launches: ActivityLaunch[]): ActivityLaunch | undefined => launches.find((launch) => id.endsWith(`-moki-${launch.id}`));
