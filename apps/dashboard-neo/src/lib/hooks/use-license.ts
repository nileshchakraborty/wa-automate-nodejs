import { useEffect, useState } from 'react';
import type { LicenseFeatures } from '@open-wa/socket-client';
import { getClient } from '@/lib/api-client';
import { useDemo } from '@/lib/demo/use-demo';
import { useSocket } from './use-socket';
import { useSessionRefresh } from './use-session-refresh';

export type LicenseTier = 'insiders' | 'restricted';
export type LicenseState = 'loading' | 'licensed' | 'unlicensed' | 'unknown' | 'unavailable';
export type LicenseSnapshot = {
  state: LicenseState;
  tier: LicenseTier | null;
  keyType: string | null;
  features: Readonly<Record<string, boolean>>;
  detail: string | null;
  verifiedAt: number | null;
  source: 'runtime' | 'demo' | null;
};
const initial: LicenseSnapshot = { state: 'loading', tier: null, keyType: null, features: {}, detail: null, verifiedAt: null, source: null };
const demo: LicenseSnapshot = { ...initial, state: 'licensed', tier: 'insiders', keyType: 'Insiders Program', features: { patch_calls_control: false, patch_calls_audio: false, patch_calls_video: false }, source: 'demo', detail: 'Demo data only; this tier is not verified by a runtime session.' };
function readTier(value: string | null): LicenseTier | null {
  const normalized = value?.trim().toLowerCase().replace(/[ _-]+/g, ' ');
  if (normalized === 'insiders' || normalized === 'insiders program') return 'insiders';
  if (normalized === 'restricted' || normalized === 'b2b restricted volume license') return 'restricted';
  return null;
}
const unlocked: LicenseSnapshot = {
  state: 'licensed',
  tier: 'insiders',
  keyType: 'Community Edition',
  features: {
    patch_calls_control: true,
    patch_calls_audio: true,
    patch_calls_video: true,
    interactive: true,
  },
  detail: 'All features permanently unlocked (Community Edition).',
  verifiedAt: Date.now(),
  source: 'runtime',
};

export function useLicense(): LicenseSnapshot {
  return unlocked;
}
