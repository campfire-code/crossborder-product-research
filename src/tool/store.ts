// 偏好保存在本机应用数据目录的 settings.json（kit 的 settingsStore），键名 prefs.e17。只存费率与开关，不含密钥（大模型密钥由 kit 设置页管理）。
import { settingsStore } from '../kit/platform';
import { DEFAULT_SETTINGS, type Settings } from './core';

const KEY = 'prefs.e17';
export interface Prefs extends Settings { useLlm: boolean }
export const DEFAULT_PREFS: Prefs = { ...DEFAULT_SETTINGS, useLlm: false };
const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
const t = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v : d);

export async function loadPrefs(): Promise<Prefs> {
  try {
    const v = (await (await settingsStore()).get<Partial<Prefs>>(KEY)) ?? {};
    const d = DEFAULT_PREFS;
    return { commission: n(v.commission, d.commission), ads: n(v.ads, d.ads), returns: n(v.returns, d.returns), shipping: n(v.shipping, d.shipping), minMargin: n(v.minMargin, d.minMargin), platform: t(v.platform, d.platform), currency: t(v.currency, d.currency), useLlm: v.useLlm === true };
  } catch { return DEFAULT_PREFS; }
}
export async function savePrefs(p: Prefs) {
  try { await (await settingsStore()).set(KEY, p); } catch { /* 忽略 */ }
}
