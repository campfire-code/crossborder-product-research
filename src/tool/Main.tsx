// 主界面：单栏报告流。上面导入商品表、填费率（生成后收成一行摘要），下面是按综合分排的商品榜单卡，每张卡有四维度分条；可看报告文本、导出 Excel / Markdown。
import { useEffect, useRef, useState } from 'react';
import { FileUp, FolderOpen, Pencil, Play, TriangleAlert } from 'lucide-react';
import type { CustomTool } from '../kit/types';
import { defaultOutputDir, pickFiles, reveal } from '../kit/platform';
import { useDroppedFiles, CopyButton } from '../kit/parts';
import { errText } from './common';
import { loadProducts, runReport, type Outcome } from './flow';
import { pctText, type Scored } from './core';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from './store';
import { PREVIEW_CSV, PREVIEW_SETTINGS, isPreview } from './preview';
import './tool.css';

type Ctx = Parameters<CustomTool['Main']>[0]['ctx'];
type Tab = 'rank' | 'text';
const NUMS: [keyof Prefs, string, string][] = [['commission', '平台佣金 %', '占售价'], ['ads', '广告费 %', '占售价'], ['returns', '退货损耗 %', '占售价'], ['shipping', '单件物流', '本币金额']];
const DIMS: [keyof Scored['dims'], string][] = [['margin', '利润'], ['demand', '需求'], ['competition', '竞争'], ['quality', '口碑']];

export function Main({ ctx }: { ctx?: Ctx }) {
  const preview = isPreview();
  const [prefs, setPrefs] = useState<Prefs>(preview ? { ...DEFAULT_PREFS, ...PREVIEW_SETTINGS } : DEFAULT_PREFS);
  const [file, setFile] = useState(preview ? '选品清单-十月.csv' : '');
  const bytes = useRef<Uint8Array | null>(preview ? new TextEncoder().encode(PREVIEW_CSV) : null);
  const [count, setCount] = useState(preview ? 9 : 0);
  const [out, setOut] = useState<Outcome | null>(null);
  const [tab, setTab] = useState<Tab>('rank');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cfgOpen, setCfgOpen] = useState(!preview);

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
      setOut(r); setCfgOpen(false);
      if (r.llmError) setNotice(`报告已生成，但 AI 解读没有成功：${r.llmError}`);
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }
  useEffect(() => { if (preview) setTimeout(() => void run(), 50); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const zeroFee = prefs.commission + prefs.ads + prefs.returns + prefs.shipping === 0;
  const cnt = (v: string) => out?.scored.filter((x) => x.verdict === v).length ?? 0;
  const total = out?.scored.length ?? 0;
  const vcls = (v: string) => (v === '推荐' ? 'ok' : v === '观察' ? 'warn' : 'err');
  return (
    <div className="pr-root">
      <section className="pr-top">
        <div className="pr-file-row">
          <button className="k-btn primary" disabled={!ctx} onClick={() => void pickFiles(['xlsx', 'csv'], '商品表').then(importFile)}><FileUp size={15} />{file ? '换一张商品表' : '导入商品表'}{hover && ' · 松开即可导入'}</button>
          <span className="pr-cur">{file ? <><b>{file}</b>　{count} 个商品</> : '支持 .xlsx / .csv，也可直接拖进窗口'}</span>
          <button className="k-btn primary pr-go" disabled={busy || !count} onClick={() => void run()}><Play size={15} />{busy ? '生成中…' : out ? '按当前费率重新生成' : '生成选品报告'}</button>
        </div>
        {!file && <p className="pr-note">必须有「商品名称」「售价」列；可选：采购成本、月销量、评论数、评分、类目（缺的维度按中性 50 分）。</p>}

        {cfgOpen ? (
          <div className="pr-cfg">
            <div className="pr-grid">
              <div className="k-field"><label className="k-label" htmlFor="pr-pf">目标平台（标注用）</label><input id="pr-pf" className="k-input" value={prefs.platform} onChange={(e) => setP({ platform: e.target.value })} /></div>
              <div className="k-field"><label className="k-label" htmlFor="pr-cur">币种</label><input id="pr-cur" className="k-input" value={prefs.currency} onChange={(e) => setP({ currency: e.target.value })} /></div>
              {NUMS.map(([k, label, help]) => (
                <div className="k-field" key={k}><label className="k-label" htmlFor={`pr-${k}`}>{label}</label><input id={`pr-${k}`} className="k-input" type="number" min={0} step="any" title={help} value={prefs[k] as number} onChange={(e) => setP({ [k]: Math.max(0, Number(e.target.value) || 0) })} /></div>
              ))}
              <div className="k-field"><label className="k-label" htmlFor="pr-min">利润率达标线 %</label><input id="pr-min" className="k-input" type="number" min={0} value={prefs.minMargin} onChange={(e) => setP({ minMargin: Math.max(0, Number(e.target.value) || 0) })} /></div>
            </div>
            {zeroFee && <p className="pr-warn"><TriangleAlert size={14} />费率和物流都是 0，利润会被高估，请按实际填写。</p>}
            <label className="k-toggle pr-ai"><input type="checkbox" checked={prefs.useLlm} onChange={(e) => setP({ useLlm: e.target.checked })} /><span>用大模型写「机会 / 风险 / 验证建议」</span></label>
            <p className="pr-note">接口地址、密钥、模型名在「设置」页自己填（兼容 OpenAI 接口）。只会把排名靠前的商品数据发给你配置的接口；不开也能得到完整的数字报告。</p>
          </div>
        ) : (
          <div className="pr-sumline">
            <span>{prefs.platform} · {prefs.currency}　佣金 {prefs.commission}%　广告 {prefs.ads}%　退货 {prefs.returns}%　物流 {prefs.shipping}　达标线 {prefs.minMargin}%</span>
            <button className="k-link pr-edit" onClick={() => setCfgOpen(true)}><Pencil size={14} />修改费率</button>
          </div>
        )}
      </section>

      {error && <div className="k-notice err" role="alert">{error}</div>}
      {notice && !error && <div className="k-notice ok">{notice}</div>}
      {!out && !error && (
        <section className="pr-empty">
          <div className="pr-empty-art" aria-hidden="true">
            <div className="pr-tbl"><i /><i /><i /><i /><span>商品表</span></div>
            <span className="pr-arrow">→</span>
            <div className="pr-rank">
              {[['1', 86, '推荐'], ['2', 64, '观察'], ['3', 41, '不建议']].map(([n, w, v]) => <div key={n as string}><b>{n}</b><u style={{ width: `${w}%` }} className={vcls(v as string)} /></div>)}
              <span>选品榜</span>
            </div>
          </div>
          <h2>一张商品表，排成一份选品榜</h2>
          <p>按你填的费率算利润，再结合需求、竞争、口碑给每个商品打综合分，分成推荐、观察、不建议三档，缺数据的地方会写明。</p>
          <p className="pr-note">没有表格可以用样例文件夹里的「商品清单-示例.csv」先试一遍。</p>
        </section>
      )}

      {out && (
        <section className="pr-report">
          <div className="pr-verdict">
            <div className="pr-vbar" role="img" aria-label={`推荐 ${cnt('推荐')}，观察 ${cnt('观察')}，不建议 ${cnt('不建议')}`}>
              <i className="ok" style={{ flex: cnt('推荐') }} /><i className="warn" style={{ flex: cnt('观察') }} /><i className="err" style={{ flex: cnt('不建议') }} />
            </div>
            <div className="pr-vnums">
              <span><b className="k-num">{total}</b>个商品</span>
              <span className="c-ok"><b className="k-num">{cnt('推荐')}</b>推荐</span>
              <span className="c-warn"><b className="k-num">{cnt('观察')}</b>观察</span>
              <span className="c-err"><b className="k-num">{cnt('不建议')}</b>不建议</span>
            </div>
          </div>
          <div className="pr-bar">
            <div className="k-seg" role="tablist">
              <button role="tab" aria-selected={tab === 'rank'} className={tab === 'rank' ? 'on' : ''} onClick={() => setTab('rank')}>选品榜</button>
              <button role="tab" aria-selected={tab === 'text'} className={tab === 'text' ? 'on' : ''} onClick={() => setTab('text')}>报告文本</button>
            </div>
            <CopyButton text={out.markdown} label="复制报告" />
          </div>
          <div className="pr-file"><FolderOpen size={15} /><span className="k-ellipsis" title={out.xlsxPath}>{out.xlsxPath}</span>{!preview && <button className="k-link" onClick={() => void reveal(out.xlsxPath)}>在文件夹中显示</button>}</div>
          {tab === 'rank' && (
            <ol className="pr-list">
              {out.scored.slice(0, 50).map((x, i) => (
                <li key={x.line} className={`pr-item ${vcls(x.verdict)}`}>
                  <span className="pr-no k-num">{i + 1}</span>
                  <div className="pr-body">
                    <div className="pr-h"><b className="pr-name" title={x.name}>{x.name}</b><span className={`k-st ${vcls(x.verdict)}`}>{x.verdict}</span></div>
                    <div className="pr-facts">
                      <span><em>利润率</em><b className={`k-num${x.margin != null && x.margin < 0 ? ' neg' : ''}`}>{pctText(x.margin)}</b></span>
                      <span><em>售价</em><b className="k-num">{x.price}</b></span>
                      <span><em>月销量</em><b className="k-num">{x.sales ?? '—'}</b></span>
                    </div>
                    <div className="pr-dims">
                      {DIMS.map(([k, label]) => (
                        <div key={k} title={x.dims[k] == null ? '缺数据，按中性 50 分计' : undefined}><span>{label}</span><i><u style={{ width: `${x.dims[k] ?? 50}%` }} className={x.dims[k] == null ? 'na' : ''} /></i><b className="k-num">{x.dims[k] ?? '—'}</b></div>
                      ))}
                    </div>
                    {x.notes.length > 0 && <p className="pr-notes">{x.notes.join('；')}</p>}
                  </div>
                  <div className="pr-score"><b className="k-num">{x.score}</b><span>综合分</span></div>
                </li>))}
            </ol>
          )}
          {tab === 'text' && <pre className="pr-md k-scroll">{out.markdown}</pre>}
          {preview && <p className="pr-note">当前是示例数据（虚构商品与费率）。</p>}
          <p className="pr-risk"><TriangleAlert size={14} /><span>数据只来自你导入的商品表，不抓取任何平台页面，也不内置各平台的费率和规则；需求、竞争分是本表商品之间的相对排名，不代表市场绝对数据。</span></p>
        </section>
      )}
    </div>
  );
}
