// 流程：读商品表 → 打分 → （可选）大模型解读 → 写 Excel 与 Markdown 报告。文件读写与大模型通过参数传入，便于测试。
import { toTable } from './common';
import { buildLlmMessages, buildReport, parseProducts, pctText, scoreProducts, WEIGHTS, type Scored, type Settings } from './core';
import { readSheets, writeXlsx } from './xlsx';

export interface Io { mkdir(p: string): Promise<void>; join(...p: string[]): Promise<string>; writeFile(p: string, d: Uint8Array): Promise<void> }
export type Llm = (m: { role: 'system' | 'user' | 'assistant'; content: string }[], o?: { json?: boolean; temperature?: number }) => Promise<string>;
export interface Outcome { scored: Scored[]; markdown: string; xlsxPath: string; mdPath: string; skipped: number; llmError: string; mapping: Record<string, string> }

export async function loadProducts(bytes: Uint8Array, file: string) {
  const name = file.split(/[\\/]/).pop() ?? file;
  const t = (await readSheets(bytes, name)).map((s) => toTable(s.grid)).find((x) => x.rows.length);
  if (!t) throw new Error(`${name} 里没有数据`);
  const r = parseProducts(t);
  if (!r.products.length) throw new Error(`${name} 里没有读到有效商品（共 ${t.rows.length} 行，均缺商品名称或售价）`);
  return r;
}

export async function runReport(o: { bytes: Uint8Array; file: string; settings: Settings; useLlm: boolean; llm?: Llm; io: Io; outDir: string; now: Date; top?: number }): Promise<Outcome> {
  const { products, mapping, skipped } = await loadProducts(o.bytes, o.file);
  const scored = scoreProducts(products, o.settings);
  const top = o.top ?? 10;
  let md = buildReport(scored, o.settings, o.now, top);
  let llmError = '';
  if (o.useLlm) {
    try {
      if (!o.llm) throw new Error('没有可用的大模型');
      const text = (await o.llm(buildLlmMessages(scored, o.settings, top), { temperature: 0.4 })).trim();
      if (!text) throw new Error('大模型返回为空');
      md += `\n\n## AI 解读（由你配置的大模型生成，仅依据上表数据，请自行核对）\n\n${text}`;
    } catch (e) { llmError = e instanceof Error ? e.message : String(e); md += `\n\n## AI 解读\n\n未生成：${llmError}`; }
  }
  const day = o.now.toISOString().slice(0, 10);
  const xlsx = await writeXlsx([
    { name: '选品排名', header: ['排名', '商品', '类目', '售价', '采购成本', '单件利润', '利润率', '月销量', '预估月销售额', '评论数', '评分', '利润分', '需求分', '竞争分', '口碑分', '综合分', '结论', '备注'],
      rows: scored.map((x, i) => [i + 1, x.name, x.category, x.price, x.cost, x.profit, x.margin, x.sales, x.revenue, x.reviews, x.rating, x.dims.margin, x.dims.demand, x.dims.competition, x.dims.quality, x.score, x.verdict, x.notes.join('；')]),
      formats: ['int', 'text', 'text', 'money', 'money', 'money', 'pct', 'int', 'money', 'int', 'text', 'int', 'int', 'int', 'int', 'int', 'text', 'text'] },
    { name: '参数说明', header: ['项目', '内容'], rows: [
      ['生成时间', day], ['数据来源', `用户导入的表格 ${o.file.split(/[\\/]/).pop()}（${products.length} 个商品，跳过 ${skipped} 行）`], ['目标平台', o.settings.platform],
      ['佣金 / 广告 / 退货损耗（占售价 %）', `${o.settings.commission} / ${o.settings.ads} / ${o.settings.returns}`], ['单件物流', `${o.settings.shipping} ${o.settings.currency}`], ['利润率达标线', `${o.settings.minMargin}%`],
      ['权重', `利润 ${WEIGHTS.margin}、需求 ${WEIGHTS.demand}、竞争 ${WEIGHTS.competition}、口碑 ${WEIGHTS.quality}（缺数据的维度按中性 50 分计入）`], ['需求 / 竞争', '本次导入商品之间的百分位排名，是相对值'],
    ] },
  ]);
  await o.io.mkdir(o.outDir);
  const xlsxPath = await o.io.join(o.outDir, `选品报告-${day}.xlsx`);
  const mdPath = await o.io.join(o.outDir, `选品报告-${day}.md`);
  await o.io.writeFile(xlsxPath, xlsx);
  await o.io.writeFile(mdPath, new TextEncoder().encode(md));
  return { scored, markdown: md, xlsxPath, mdPath, skipped, llmError, mapping };
}
export { pctText };
