import { describe, expect, it } from 'vitest';
import { toTable } from './common';
import { buildLlmMessages, buildReport, DEFAULT_SETTINGS, num, parseProducts, scoreProducts, unitProfit, type Product, type Settings } from './core';

const T = (h: string[], rows: (string | number)[][]) => toTable([h, ...rows]);
const S = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...o });
const P = (o: Partial<Product>): Product => ({ line: 2, name: 'x', category: '', price: 10, cost: 4, sales: 100, reviews: 10, rating: 4.5, ...o });

describe('num', () => {
  it('支持千分位、k、万、币种前缀', () => {
    expect(num('1,200')).toBe(1200); expect(num('2.5k')).toBe(2500); expect(num('1.2万')).toBe(12000); expect(num('$9.9')).toBe(9.9); expect(num('n/a')).toBeNull(); expect(num(null)).toBeNull();
  });
});
describe('parseProducts', () => {
  it('识别中英文表头，跳过缺名称或售价的行', () => {
    const r = parseProducts(T(['Title', 'Price', 'Monthly Sales', 'Reviews', 'Rating', 'Cost'], [['A', 10, 100, 5, 4.5, 3], ['', 5, 1, 1, 1, 1], ['B', 'abc', 1, 1, 1, 1]]));
    expect(r.products).toHaveLength(1);
    expect(r.products[0]).toMatchObject({ name: 'A', price: 10, sales: 100, reviews: 5, rating: 4.5, cost: 3, line: 2 });
    expect(r.skipped).toBe(2);
  });
  it('缺售价列报错并列出表头', () => {
    expect(() => parseProducts(T(['商品名称', '备注'], [['a', 'b']]))).toThrow(/售价.*商品名称、备注/);
  });
});
describe('unitProfit', () => {
  it('售价 - 成本 - 物流 - 售价×(佣金+广告+退货)%', () => {
    expect(unitProfit(P({}), S({ commission: 10, ads: 5, returns: 5, shipping: 1 }))).toBeCloseTo(10 - 4 - 1 - 2, 6);
    expect(unitProfit(P({ cost: null }), S())).toBeNull();
  });
});
describe('scoreProducts', () => {
  const s = S({ commission: 10, minMargin: 20 });
  const list = scoreProducts([
    P({ name: '好', price: 20, cost: 5, sales: 5000, reviews: 10, rating: 4.8 }),
    P({ name: '亏', price: 10, cost: 10, sales: 6000, reviews: 5, rating: 4.9 }),
    P({ name: '红海', price: 20, cost: 5, sales: 100, reviews: 9000, rating: 3.2 }),
    P({ name: '缺成本', cost: null }),
  ], s);
  const by = Object.fromEntries(list.map((x) => [x.name, x]));
  it('按综合分降序，亏损与低于达标线为不建议', () => {
    expect(list[0].name).toBe('好');
    expect(by['亏'].verdict).toBe('不建议');
    expect(by['亏'].notes).toContain('按当前费率设置会亏损');
    expect(by['好'].verdict).toBe('推荐');
  });
  it('缺成本时利润维度不计入并标为观察', () => {
    expect(by['缺成本'].dims.margin).toBeNull();
    expect(by['缺成本'].verdict).toBe('观察');
    expect(by['缺成本'].notes).toContain('缺采购成本，无法算利润');
  });
  it('竞争分：评论越少越高；口碑分线性映射', () => {
    expect(by['好'].dims.competition!).toBeGreaterThan(by['红海'].dims.competition!);
    expect(by['好'].dims.quality).toBe(90);
    expect(by['红海'].dims.quality).toBe(10);
  });
  it('只有一个商品也能打分', () => {
    expect(scoreProducts([P({})], S())[0].score).toBeGreaterThan(0);
  });
  it('所有维度都缺失时综合分为中性 50，且不会被评为推荐', () => {
    const r = scoreProducts([P({ cost: null, sales: null, reviews: null, rating: null })], S())[0];
    expect(r.score).toBe(50);
    expect(r.verdict).toBe('观察');
  });
  it('只有利润高、其他数据都缺的商品，排在数据完整的好商品之后', () => {
    const r = scoreProducts([P({ name: '缺数据', price: 20, cost: 2, sales: null, reviews: null, rating: null }), P({ name: '完整', price: 20, cost: 5, sales: 5000, reviews: 10, rating: 4.8 }), P({ name: '陪衬', sales: 10, reviews: 5000, rating: 3.5 })], S());
    expect(r[0].name).toBe('完整');
    expect(r.find((x) => x.name === '缺数据')!.verdict).toBe('观察');
  });
});
describe('报告文本', () => {
  const list = scoreProducts([P({ name: '示例杯' })], S());
  it('费率全为 0 时给出高估提示', () => {
    expect(buildReport(list, S(), new Date('2026-10-23'), 5)).toContain('利润被高估');
    expect(buildReport(list, S({ commission: 8 }), new Date('2026-10-23'), 5)).not.toContain('利润被高估');
  });
  it('给大模型的提示禁止编造并只含表中数据', () => {
    const m = buildLlmMessages(list, S());
    expect(m[0].content).toContain('不得编造');
    expect(m[1].content).toContain('示例杯');
  });
});
