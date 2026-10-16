import {Billing} from '../native';
import {readJson, writeJson} from '../lib/safeStorage';

/**
 * Free users get a monthly allowance rather than a lifetime one, so a heavy month
 * is a nudge to upgrade instead of a dead end. Reinstalling resets the count -
 * that is accepted; the paid unlock is what Play Billing actually protects.
 */
const KEY = 'mps.quota.v1';
export const FREE_EXPORTS_PER_MONTH = 25;

type Quota = {month: string; used: number};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function isQuota(v: unknown): v is Quota {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Quota).month === 'string' &&
    Number.isFinite((v as Quota).used)
  );
}

export async function readQuota(): Promise<Quota> {
  const fresh: Quota = {month: currentMonth(), used: 0};
  const parsed = await readJson<Quota>(KEY, fresh, isQuota);
  return parsed.month === fresh.month ? parsed : fresh;
}

export async function spendExport(count = 1): Promise<number> {
  const q = await readQuota();
  const next = {month: q.month, used: q.used + count};
  await writeJson(KEY, next);
  return Math.max(0, FREE_EXPORTS_PER_MONTH - next.used);
}

export async function remainingExports(): Promise<number> {
  // The paid unlock lifts the cap entirely; Play is asked rather than a local flag.
  const paid = await Billing.isAdFree().catch(() => false);
  if (paid) return Number.MAX_SAFE_INTEGER;
  const q = await readQuota();
  return Math.max(0, FREE_EXPORTS_PER_MONTH - q.used);
}

export async function grantBonusExport(): Promise<void> {
  const q = await readQuota();
  await writeJson(KEY, {month: q.month, used: Math.max(0, q.used - 1)});
}
