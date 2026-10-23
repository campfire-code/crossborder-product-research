import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runReport, type Io, type Llm } from './flow';
import { DEFAULT_SETTINGS } from './core';
import { readSheets } from './xlsx';

const bytes = new Uint8Array(readFileSync(new URL('../../samples/商品清单-示例.csv', import.meta.url)));
const mem = () => { const files = new Map<string, Uint8Array>(); const io: Io = { mkdir: async () => {}, join: async (...p) => p.join('/'), writeFile: async (p, d) => void files.set(p, d) }; return { io, files }; };
const settings = { ...DEFAULT_SETTINGS, commission: 8, ads: 10, returns: 3, shipping: 2, minMargin: 20 };
const now = new Date('2026-10-23T00:00:00Z');
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe('用 samples 里的示例商品表', () => {
  it('不用大模型：读到 7 个商品、跳过 1 行，输出 xlsx 与 md', async () => {
    const { io, files } = mem();
    const r = await runReport({ bytes, file: '/in/商品清单-示例.csv', settings, useLlm: false, io, outDir: '/out', now });
    expect(r.scored).toHaveLength(7);
    expect(r.skipped).toBe(1);
    expect(files.has('/out/选品报告-2026-10-23.xlsx') && files.has('/out/选品报告-2026-10-23.md')).toBe(true);
    const sheets = await readSheets(files.get(r.xlsxPath)!, 'r.xlsx');
    expect(sheets.map((s) => s.name)).toEqual(['选品排名', '参数说明']);
    expect(sheets[0].grid).toHaveLength(8);
    expect((sheets[0].grid[0] as string[])[15]).toBe('综合分');
    // 保温杯：19.9-5.5-2-19.9×21% = 8.221 → 8.22
    const cup = r.scored.find((x) => x.name.includes('保温杯'))!;
    expect(cup.profit).toBe(8.22);
    expect(r.scored.find((x) => x.name.includes('挂脖风扇'))!.verdict).toBe('不建议');
    expect(dec(files.get(r.mdPath)!)).toContain('选品分析报告');
  });
  it('缺销量/评论的商品仍参与排名并有备注', async () => {
    const { io } = mem();
    const r = await runReport({ bytes, file: 'a.csv', settings, useLlm: false, io, outDir: '/o', now });
    expect(r.scored.find((x) => x.name.includes('收纳包'))!.notes).toEqual(expect.arrayContaining(['缺销量', '缺评论数']));
  });
});
describe('大模型解读', () => {
  it('用假大模型：解读追加到报告，提示里只含表中数据', async () => {
    const { io, files } = mem();
    let prompt = '';
    const llm: Llm = async (m) => { prompt = m[1].content; return '### 机会判断\n示例结论'; };
    const r = await runReport({ bytes, file: 'a.csv', settings, useLlm: true, llm, io, outDir: '/o', now, top: 3 });
    expect(r.llmError).toBe('');
    expect(dec(files.get(r.mdPath)!)).toContain('AI 解读');
    expect(dec(files.get(r.mdPath)!)).toContain('示例结论');
    expect(prompt.split('\n').filter((l) => /^\d+\./.test(l))).toHaveLength(3);
  });
  it('大模型出错时报告照样生成，并写明原因', async () => {
    const { io, files } = mem();
    const llm: Llm = async () => { throw new Error('还没有设置大模型：请到「设置」里填写接口地址、密钥和模型名'); };
    const r = await runReport({ bytes, file: 'a.csv', settings, useLlm: true, llm, io, outDir: '/o', now });
    expect(r.llmError).toContain('还没有设置大模型');
    expect(dec(files.get(r.mdPath)!)).toContain('未生成：还没有设置大模型');
    expect(files.has(r.xlsxPath)).toBe(true);
  });
  it('表头不对时报错且不写文件', async () => {
    const { io, files } = mem();
    await expect(runReport({ bytes: new TextEncoder().encode('备注\n1\n'), file: 'x.csv', settings, useLlm: false, io, outDir: '/o', now })).rejects.toThrow('售价');
    expect(files.size).toBe(0);
  });
});
