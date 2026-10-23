// 主界面：左侧导入商品表、填费率、选是否用大模型；右侧看排名与报告文本，导出 Excel / Markdown。
import { useEffect, useRef, useState } from 'react';
import { FileUp, FolderOpen, Play, TriangleAlert } from 'lucide-react';
import type { CustomTool } from '../kit/types';
import { defaultOutputDir, pickFiles, reveal } from '../kit/platform';
import { useDroppedFiles, CopyButton } from '../kit/parts';
import { errText } from './common';
import { loadProducts, runReport, type Outcome } from './flow';
import { pctText } from './core';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from './store';
import { PREVIEW_CSV, PREVIEW_SETTINGS, isPreview } from './preview';
import './tool.css';

type Ctx = Parameters<CustomTool['Main']>[0]['ctx'];
type Tab = 'rank' | 'text';
const NUMS: [keyof Prefs, string, string][] = [['commission', '平台佣金 %', '占售价'], ['ads', '广告费 %', '占售价'], ['returns', '退货损耗 %', '占售价'], ['shipping', '单件物流', '本币金额']];

export function Main({ ctx }: { ctx?: Ctx }) {
  const preview = isPreview();
  const [prefs, setPrefs] = useState<Prefs>(preview ? { ...DEFAULT_PREFS, ...PREVIEW_SETTINGS } : DEFAULT_PREFS);
  const [file, setFile] = useState(preview ? '示例商品清单.csv' : '');
  const bytes = useRef<Uint8Array | null>(preview ? new TextEncoder().encode(PREVIEW_CSV) : null);
  const [count, setCount] = useState(preview ? 9 : 0);
  const [out, setOut] = useState<Outcome | null>(null);
  const [tab, setTab] = useState<Tab>('rank');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { if (!preview) void loadPrefs().then(setPrefs); }, [preview]);
  const setP = (patch: Partial<Prefs>) => setPrefs((p) => { const n = { ...p, ...patch }; void savePrefs(n); return n; });

  async function importFile(paths: string[]) {
    if (!ctx || !paths.length) return;
    setError(''); setNotice(''); setOut(null);
    try {
      const b = await ctx.readFile(paths[0]);
      const r = await loadProducts(b, paths[0]);
      bytes.current = b; setFile(paths[0].split(/[\\/]/).pop() ?? paths[0]); setCount(r.products.length);
      setNotice(`读到 ${r.products.length} 个商品${r.skipped ? `，跳过 ${r.skipped} 行（缺名称或售价）` : ''}。识别到的列：${Object.values(r.mapping).join('、')}`);
    } catch (e) { setError(errText(e)); }
  }
  const hover = useDroppedFiles((p) => void importFile(p));

  async function run() {
    if (!bytes.current) { setError('请先导入商品表'); return; }
    setError(''); setBusy(true);
    try {
      const io = ctx ?? { mkdir: async () => {}, writeFile: async () => {}, join: async (...p: string[]) => p.join('/') };
      const outDir = preview ? '/示例/下载/跨境选品报告' : await defaultOutputDir('跨境选品报告');
      const r = await runReport({ bytes: bytes.current, file, settings: prefs, useLlm: prefs.useLlm && !preview, llm: ctx?.llm, io, outDir, now: new Date(), top: 10 });
      setOut(r);
      if (r.llmError) setNotice(`报告已生成，但 AI 解读没有成功：${r.llmError}`);
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }
  useEffect(() => { if (preview) setTimeout(() => void run(), 50); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const zeroFee = prefs.commission + prefs.ads + prefs.returns + prefs.shipping === 0;
  const cnt = (v: string) => out?.scored.filter((x) => x.verdict === v).length ?? 0;
  return (
    <div className="pr-root">
      <section className="k-panel pr-side">
        <p className="pr-risk"><TriangleAlert size={13} /> 数据<b>只来自你导入的商品表</b>，工具不抓取任何平台页面，也不内置各平台的费率和规则；所有费率由你自己填。需求、竞争分是本表商品之间的相对排名，不代表市场绝对数据。</p>
        <h3 className="k-section">1. 商品表</h3>
        <button className="k-btn primary" disabled={!ctx} onClick={() => void pickFiles(['xlsx', 'csv'], '商品表').then(importFile)}><FileUp size={14} />导入商品表{hover && ' · 松开即可导入'}</button>
        <p className="k-muted pr-note">{file ? <>当前：<b>{file}</b>（{count} 个商品）</> : '支持 .xlsx / .csv，也可直接拖进窗口。'}必须有「商品名称」「售价」列；可选：采购成本、月销量、评论数、评分、类目（缺的维度按中性 50 分）。</p>
        <h3 className="k-section">2. 费率与门槛</h3>
        <div className="pr-two">
          <div className="k-field"><label className="k-label" htmlFor="pr-pf">目标平台（标注用）</label><input id="pr-pf" className="k-input" value={prefs.platform} onChange={(e) => setP({ platform: e.target.value })} /></div>
          <div className="k-field"><label className="k-label" htmlFor="pr-cur">币种</label><input id="pr-cur" className="k-input" value={prefs.currency} onChange={(e) => setP({ currency: e.target.value })} /></div>
          {NUMS.map(([k, label, help]) => (
            <div className="k-field" key={k}><label className="k-label" htmlFor={`pr-${k}`}>{label}</label><input id={`pr-${k}`} className="k-input" type="number" min={0} step="any" title={help} value={prefs[k] as number} onChange={(e) => setP({ [k]: Math.max(0, Number(e.target.value) || 0) })} /></div>
          ))}
          <div className="k-field"><label className="k-label" htmlFor="pr-min">利润率达标线 %</label><input id="pr-min" className="k-input" type="number" min={0} value={prefs.minMargin} onChange={(e) => setP({ minMargin: Math.max(0, Number(e.target.value) || 0) })} /></div>
        </div>
        {zeroFee && <p className="pr-warn"><TriangleAlert size={13} /> 费率和物流都是 0，利润会被高估，请按实际填写。</p>}
        <h3 className="k-section">3. AI 解读（可选）</h3>
        <label className="k-toggle"><input type="checkbox" checked={prefs.useLlm} onChange={(e) => setP({ useLlm: e.target.checked })} /><span>用大模型写「机会 / 风险 / 验证建议」</span></label>
        <p className="k-muted pr-note">接口地址、密钥、模型名在「设置」页自己填（兼容 OpenAI 接口）。只会把排名靠前的商品数据发给你配置的接口；不开也能得到完整的数字报告。</p>
        <button className="k-btn primary" disabled={busy || !count} onClick={() => void run()}><Play size={14} />{busy ? '生成中…' : '生成选品报告'}</button>
      </section>

      <section className="k-panel pr-main">
        {error && <div className="k-notice err" role="alert">{error}</div>}
        {notice && !error && <div className="k-notice ok">{notice}</div>}
        {!out && !error && <div className="k-empty"><p>导入商品表、填好费率后点「生成选品报告」。</p><p className="k-muted">没有表格可以用 samples 里的「商品清单-示例.csv」先试一遍。</p></div>}
        {out && (
          <>
            <div className="pr-sum">
              <div><b className="k-num">{out.scored.length}</b><span className="k-muted">商品</span></div>
              <div><b className="k-num">{cnt('推荐')}</b><span className="k-muted">推荐</span></div>
              <div><b className="k-num">{cnt('观察')}</b><span className="k-muted">观察</span></div>
              <div><b className="k-num">{cnt('不建议')}</b><span className="k-muted">不建议</span></div>
            </div>
            <div className="pr-file"><FolderOpen size={15} /><span className="k-ellipsis" title={out.xlsxPath}>{out.xlsxPath}</span>{!preview && <button className="k-link" onClick={() => void reveal(out.xlsxPath)}>在文件夹中显示</button>}</div>
            <div className="pr-bar">
              <div className="k-seg" role="tablist">
                <button role="tab" aria-selected={tab === 'rank'} className={tab === 'rank' ? 'on' : ''} onClick={() => setTab('rank')}>排名</button>
                <button role="tab" aria-selected={tab === 'text'} className={tab === 'text' ? 'on' : ''} onClick={() => setTab('text')}>报告文本</button>
              </div>
              <CopyButton text={out.markdown} label="复制报告" />
            </div>
            {tab === 'rank' && (
              <div className="k-table-wrap k-scroll pr-table">
                <table className="k-table">
                  <thead><tr><th>#</th><th>商品</th><th>售价</th><th>利润率</th><th>月销量</th><th>综合分</th><th>结论</th></tr></thead>
                  <tbody>{out.scored.slice(0, 50).map((x, i) => (
                    <tr key={x.line}>
                      <td className="k-num">{i + 1}</td><td><div className="pr-name" title={x.name}>{x.name}</div></td><td className="k-num">{x.price}</td>
                      <td className="k-num">{pctText(x.margin)}</td><td className="k-num">{x.sales ?? '—'}</td><td className="k-num"><b>{x.score}</b></td>
                      <td><span className={`k-st ${x.verdict === '推荐' ? 'ok' : x.verdict === '观察' ? 'warn' : 'err'}`}>{x.verdict}</span></td>
                    </tr>))}</tbody>
                </table>
              </div>
            )}
            {tab === 'text' && <pre className="pr-md k-scroll">{out.markdown}</pre>}
            {preview && <p className="k-muted pr-note">当前是示例数据（虚构商品与费率）。</p>}
          </>
        )}
      </section>
    </div>
  );
}
