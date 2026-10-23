// 选品评分的核心纯函数：把用户导入的商品表识别成统一结构，按利润、需求、竞争、口碑打分并生成文字报告。
// 数据只来自用户导入的表格，不抓取任何平台；费率、阈值全部由用户填写，工具不内置任何平台费率。
import { cellText, type Cell, type Table } from './common';

export interface Product {
  line: number; name: string; category: string; price: number;
  cost: number | null; sales: number | null; reviews: number | null; rating: number | null;
}
export interface Settings {
  /** 平台佣金率 %、广告费占比 %、退货损耗占比 %：都按售价的百分比扣；单件物流费用本币金额 */
  commission: number; ads: number; returns: number; shipping: number;
  /** 利润率达标线 % */
  minMargin: number; platform: string; currency: string;
}
export const DEFAULT_SETTINGS: Settings = { commission: 0, ads: 0, returns: 0, shipping: 0, minMargin: 20, platform: 'TikTok Shop', currency: 'USD' };

const COLS: Record<string, RegExp[]> = {
  name: [/^(商品名称|商品名|产品名称|标题|名称)$/, /(商品|产品).{0,2}(名|标题)|title|name/i],
  price: [/^(售价|价格|单价|零售价)$/, /售价|价格|price/i],
  cost: [/^(采购成本|成本|进货价|成本价)$/, /成本|进货|cost/i],
  sales: [/^(月销量|销量|月销|销售量)$/, /销量|销售量|sold|sales/i],
  reviews: [/^(评论数|评价数|评论数量|评价数量)$/, /评论|评价数|reviews|ratings?[\s_]*(count|number)/i],
  rating: [/^(评分|星级|评价分)$/, /评分|星级|rating|stars?/i],
  category: [/^(类目|品类|分类)$/, /类目|品类|分类|category/i],
};
const LABEL: Record<string, string> = { name: '商品名称', price: '售价' };

export const num = (v: Cell): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = cellText(v).replace(/[,，\s]/g, '').replace(/^[A-Za-z$¥￥฿₫₱]+/, '');
  let k = 1;
  if (/[kK]$/.test(t)) { k = 1000; t = t.slice(0, -1); } else if (/万$/.test(t)) { k = 10000; t = t.slice(0, -1); }
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) * k : null;
};

export function parseProducts(t: Table): { products: Product[]; mapping: Record<string, string>; skipped: number } {
  const ix: Record<string, number> = {};
  const used = new Set<number>();
  for (const [k, res] of Object.entries(COLS)) {
    const i = res.map((re) => t.header.findIndex((h, n) => !used.has(n) && re.test(h))).find((n) => n >= 0) ?? -1;
    ix[k] = i;
    if (i >= 0) used.add(i);
  }
  const miss = ['name', 'price'].filter((k) => ix[k] < 0);
  if (miss.length) throw new Error(`商品表里没有找到「${miss.map((k) => LABEL[k]).join('、')}」列。表头是：${t.header.slice(0, 12).join('、') || '（空）'}。请把表头改成含有这些字样再导入。`);
  const products: Product[] = [];
  let skipped = 0;
  t.rows.forEach((r, n) => {
    const name = cellText(r[ix.name]);
    const price = num(r[ix.price]);
    if (!name || price == null || price <= 0) { skipped++; return; }
    const g = (k: string) => (ix[k] >= 0 ? num(r[ix[k]]) : null);
    products.push({ line: n + 2, name, category: ix.category >= 0 ? cellText(r[ix.category]) : '', price, cost: g('cost'), sales: g('sales'), reviews: g('reviews'), rating: g('rating') });
  });
  const mapping = Object.fromEntries(Object.entries(ix).filter(([, i]) => i >= 0).map(([k, i]) => [k, t.header[i]]));
  return { products, mapping, skipped };
}

export interface Scored extends Product {
  profit: number | null; margin: number | null; revenue: number | null;
  /** 各维度 0~100 分（缺数据为 null） */
  dims: { margin: number | null; demand: number | null; competition: number | null; quality: number | null };
  score: number; verdict: '推荐' | '观察' | '不建议'; notes: string[];
}
/** 维度权重：利润 35、需求 30、竞争 20、口碑 15；缺失的维度按中性 50 分计入（避免数据少的商品靠单项高分排到前面） */
export const WEIGHTS = { margin: 35, demand: 30, competition: 20, quality: 15 } as const;

const NEUTRAL = 50;
export const unitProfit = (p: Product, s: Settings): number | null =>
  p.cost == null ? null : p.price - p.cost - s.shipping - (p.price * (s.commission + s.ads + s.returns)) / 100;

/** 百分位排名 0~100：值越大越高；只有一个样本时给 50 */
function percentile(values: (number | null)[], invert = false): (number | null)[] {
  const xs = values.filter((v): v is number => v != null);
  return values.map((v) => {
    if (v == null) return null;
    if (xs.length < 2) return 50;
    const below = xs.filter((x) => x < v).length;
    const eq = xs.filter((x) => x === v).length;
    const p = ((below + (eq - 1) / 2) / (xs.length - 1)) * 100;
    return Math.round(invert ? 100 - p : p);
  });
}

export function scoreProducts(products: Product[], s: Settings): Scored[] {
  const profit = products.map((p) => unitProfit(p, s));
  const margin = products.map((p, i) => (profit[i] == null ? null : (profit[i] as number) / p.price));
  const demand = percentile(products.map((p) => p.sales));
  // 竞争：评论数越少越好；没有评论数时按中性 50 分
  const comp = percentile(products.map((p) => p.reviews), true);
  // 口碑：评分线性映射 3.0→0、5.0→100（本工具的取值，不是平台标准）
  const quality = products.map((p) => (p.rating == null ? null : Math.round(Math.max(0, Math.min(100, ((p.rating - 3) / 2) * 100)))));
  // 利润维度：利润率 0%→0 分，40%及以上→100 分（线性）
  const marginScore = margin.map((m) => (m == null ? null : Math.round(Math.max(0, Math.min(100, (m / 0.4) * 100)))));
  return products.map((p, i) => {
    const dims = { margin: marginScore[i], demand: demand[i], competition: comp[i], quality: quality[i] };
    let sum = 0;
    for (const k of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) sum += WEIGHTS[k] * (dims[k] ?? NEUTRAL);
    const score = Math.round(sum / 100);
    const notes: string[] = [];
    const m = margin[i];
    if (m == null) notes.push('缺采购成本，无法算利润');
    else if (m < 0) notes.push('按当前费率设置会亏损');
    else if (m * 100 < s.minMargin) notes.push(`利润率低于 ${s.minMargin}% 的达标线`);
    if (p.sales == null) notes.push('缺销量');
    if (p.reviews == null) notes.push('缺评论数');
    const verdict: Scored['verdict'] = m == null ? '观察' : m < 0 || m * 100 < s.minMargin ? '不建议' : score >= 60 && p.sales != null ? '推荐' : '观察';
    return { ...p, profit: profit[i] == null ? null : round2(profit[i] as number), margin: m == null ? null : Math.round(m * 1000) / 1000, revenue: p.sales == null ? null : round2(p.sales * p.price), dims, score, verdict, notes };
  }).sort((a, b) => b.score - a.score);
}
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const pctText = (m: number | null) => (m == null ? '—' : `${(m * 100).toFixed(1)}%`);

/** 不用大模型也能生成的数字版报告（Markdown） */
export function buildReport(list: Scored[], s: Settings, now: Date, top = 10): string {
  const L: string[] = [];
  const count = (v: Scored['verdict']) => list.filter((x) => x.verdict === v).length;
  L.push(`# 选品分析报告`, '', `- 生成时间：${now.toISOString().slice(0, 10)}`, `- 目标平台：${s.platform}（仅作标注，工具不内置任何平台规则）`, `- 商品数：${list.length}；推荐 ${count('推荐')}，观察 ${count('观察')}，不建议 ${count('不建议')}`);
  L.push(`- 费率设置（均由用户填写）：佣金 ${s.commission}%，广告 ${s.ads}%，退货损耗 ${s.returns}%，单件物流 ${s.shipping} ${s.currency}；利润率达标线 ${s.minMargin}%`);
  if (s.commission + s.ads + s.returns + s.shipping === 0) L.push('- **注意：费率与物流费都是 0，利润被高估，请先按实际情况填写。**');
  L.push('', '## 打分口径', `综合分 = 利润 ${WEIGHTS.margin}% + 需求 ${WEIGHTS.demand}% + 竞争 ${WEIGHTS.competition}% + 口碑 ${WEIGHTS.quality}%；缺数据的维度按中性 50 分计入，缺月销量的商品最高评为「观察」。需求、竞争按本次导入商品之间的百分位排名（相对值，不是市场绝对值）；利润率 40% 及以上满分；评分 3 星 0 分、5 星满分。`);
  L.push('', `## 综合分前 ${Math.min(top, list.length)} 名`, '', '| 排名 | 商品 | 售价 | 单件利润 | 利润率 | 月销量 | 评论数 | 评分 | 综合分 | 结论 |', '|---|---|---|---|---|---|---|---|---|---|');
  list.slice(0, top).forEach((x, i) => L.push(`| ${i + 1} | ${x.name} | ${x.price} | ${x.profit ?? '—'} | ${pctText(x.margin)} | ${x.sales ?? '—'} | ${x.reviews ?? '—'} | ${x.rating ?? '—'} | ${x.score} | ${x.verdict} |`));
  const risky = list.filter((x) => x.notes.length);
  if (risky.length) { L.push('', '## 数据缺口与风险提示'); risky.slice(0, 20).forEach((x) => L.push(`- ${x.name}：${x.notes.join('；')}`)); }
  return L.join('\n');
}

/** 给大模型的提示：只给它计算好的数据，禁止编造表里没有的市场数据 */
export function buildLlmMessages(list: Scored[], s: Settings, top = 10) {
  const rows = list.slice(0, top).map((x, i) => `${i + 1}. ${x.name}｜类目:${x.category || '未填'}｜售价:${x.price}｜单件利润:${x.profit ?? '未知'}｜利润率:${pctText(x.margin)}｜月销量:${x.sales ?? '未知'}｜评论数:${x.reviews ?? '未知'}｜评分:${x.rating ?? '未知'}｜综合分:${x.score}｜${x.verdict}`);
  return [
    { role: 'system' as const, content: '你是跨境电商选品分析师。只能依据用户给出的表格数据下结论，表里没有的信息（市场规模、趋势、平台政策、费率、法规）一律不得编造，不知道就写「表中无此数据」。用简体中文，输出 Markdown，分三节：「机会判断」「主要风险」「下一步验证建议」，总共不超过 500 字。' },
    { role: 'user' as const, content: `目标平台：${s.platform}；币种：${s.currency}；利润率达标线：${s.minMargin}%。\n以下是按综合分排序的前 ${rows.length} 个商品（需求、竞争为本次导入商品之间的相对排名）：\n${rows.join('\n')}` },
  ];
}
