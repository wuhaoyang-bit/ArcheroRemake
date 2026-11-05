import './arrow-shoot-sfx-lab.css';
import { OneShotBank } from './sfx.ts';

type Clip = {
  id: string;
  file: string;
  title: string;
  author: string;
  source: string;
  license: string;
  url: string;
  tags: string[];
  note: string;
  duration: number | null;
  bytes?: number;
};

type Manifest = { clips: Clip[]; count: number };

const STORAGE_KEY = 'archero-arrow-shoot-sfx-picks-v1';

type Stored = {
  ratings: Record<string, number>;
  picks: string[];
};

const base = import.meta.env.BASE_URL || './';
const manifestUrl = `${base}audio/arrow-shoot-candidates/manifest.json`;

function clipUrl(file: string) {
  return `${base}audio/arrow-shoot-candidates/${file}`;
}

function loadStored(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ratings: {}, picks: [] };
    const parsed = JSON.parse(raw) as Stored;
    return {
      ratings: parsed.ratings && typeof parsed.ratings === 'object' ? parsed.ratings : {},
      picks: Array.isArray(parsed.picks) ? parsed.picks : [],
    };
  } catch {
    return { ratings: {}, picks: [] };
  }
}

function saveStored(s: Stored) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function fmtDur(sec: number | null) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  return `${sec.toFixed(2)}s`;
}

function tagClass(tag: string) {
  if (tag === 'release' || tag === 'short' || tag === 'hit' || tag === 'whoosh' || tag === 'layer') return tag;
  return '';
}

const app = document.querySelector('#app')!;
app.innerHTML = `
  <header>
    <h1>弓箭射出音效 · 候选试听</h1>
    <p class="lead">
      全网搜到的免费「射出 / 松弦 / 箭矢破空」素材，用项目里的 <code>OneShotBank</code>（Web Audio + 半音音高）播放。
      俯视角连射要短、脆、可读；先听单发，再听连射。勾选你觉得好的，底部会汇总。
    </p>
    <p class="meta">素材目录 <code>public/audio/arrow-shoot-candidates/</code> · 版权见同目录 <a href="./audio/arrow-shoot-candidates/CREDITS.md">CREDITS.md</a></p>
  </header>
  <div id="error"></div>
  <div class="toolbar" id="toolbar"></div>
  <div class="stats" id="stats"></div>
  <div class="grid" id="grid"></div>
  <section class="footer-picks">
    <h2>当前勾选（localStorage）</h2>
    <pre id="picks-out">（尚未勾选）</pre>
  </section>
`;

const errEl = document.querySelector('#error') as HTMLDivElement;
const toolbar = document.querySelector('#toolbar') as HTMLDivElement;
const stats = document.querySelector('#stats') as HTMLDivElement;
const grid = document.querySelector('#grid') as HTMLDivElement;
const picksOut = document.querySelector('#picks-out') as HTMLPreElement;

function showError(msg: string) {
  errEl.style.display = 'block';
  errEl.textContent = msg;
}

toolbar.innerHTML = `
  <div class="toolbar-row">
    <div class="field">
      <label>音量 <strong id="vol-read">0.80</strong></label>
      <input id="vol" type="range" min="0" max="1" step="0.01" value="0.8">
    </div>
    <div class="field">
      <label>音高下限（半音） <strong id="pmin-read">-1.0</strong></label>
      <input id="pmin" type="range" min="-12" max="12" step="0.1" value="-1">
    </div>
    <div class="field">
      <label>音高上限（半音） <strong id="pmax-read">1.0</strong></label>
      <input id="pmax" type="range" min="-12" max="12" step="0.1" value="1">
    </div>
    <div class="field">
      <label>连射间隔（s） <strong id="gap-read">0.05</strong></label>
      <input id="gap" type="range" min="0.02" max="0.3" step="0.01" value="0.05">
    </div>
    <div class="field">
      <label>连射次数 <strong id="burst-read">5</strong></label>
      <input id="burst" type="range" min="2" max="12" step="1" value="5">
    </div>
    <div class="field">
      <label>来源筛选</label>
      <select id="src-filter">
        <option value="all">全部</option>
        <option value="Freesound">Freesound</option>
        <option value="Mixkit">Mixkit</option>
      </select>
    </div>
    <div class="field">
      <label>标签筛选</label>
      <select id="tag-filter">
        <option value="all">全部</option>
        <option value="release">release 松弦/射出</option>
        <option value="short">short 短促</option>
        <option value="whoosh">whoosh 破空</option>
        <option value="hit">hit 命中对照</option>
        <option value="layer">layer 可叠层</option>
      </select>
    </div>
    <div class="field">
      <label>排序</label>
      <select id="sort">
        <option value="default">清单顺序</option>
        <option value="duration">按时长 ↑</option>
        <option value="rating">按评分 ↓</option>
        <option value="picked">勾选优先</option>
      </select>
    </div>
    <button type="button" class="ghost" id="clear-picks">清空勾选</button>
    <button type="button" class="ghost" id="clear-ratings">清空评分</button>
  </div>
  <p class="hint">播放逻辑与游戏一致：<code>playbackRate = 2^(半音/12)</code>，连射时每发独立随机音高。先点任意「播一次」解锁音频。长于 ~2.5s 的卡片会标「偏长」。</p>
`;

const vol = document.querySelector('#vol') as HTMLInputElement;
const pmin = document.querySelector('#pmin') as HTMLInputElement;
const pmax = document.querySelector('#pmax') as HTMLInputElement;
const gap = document.querySelector('#gap') as HTMLInputElement;
const burst = document.querySelector('#burst') as HTMLInputElement;
const srcFilter = document.querySelector('#src-filter') as HTMLSelectElement;
const tagFilter = document.querySelector('#tag-filter') as HTMLSelectElement;
const sortSel = document.querySelector('#sort') as HTMLSelectElement;

function syncReadouts() {
  (document.querySelector('#vol-read') as HTMLElement).textContent = Number(vol.value).toFixed(2);
  (document.querySelector('#pmin-read') as HTMLElement).textContent = Number(pmin.value).toFixed(1);
  (document.querySelector('#pmax-read') as HTMLElement).textContent = Number(pmax.value).toFixed(1);
  (document.querySelector('#gap-read') as HTMLElement).textContent = Number(gap.value).toFixed(2);
  (document.querySelector('#burst-read') as HTMLElement).textContent = String(Math.round(Number(burst.value)));
}
[vol, pmin, pmax, gap, burst].forEach(el => el.addEventListener('input', syncReadouts));
syncReadouts();

const banks = new Map<string, OneShotBank>();
const burstTimers = new Map<string, number[]>();
let clips: Clip[] = [];
let stored = loadStored();

function getBank(clip: Clip) {
  let bank = banks.get(clip.id);
  if (!bank) {
    bank = new OneShotBank([clipUrl(clip.file)], 4, false);
    bank.bindUnlock(document);
    bank.preload();
    banks.set(clip.id, bank);
  }
  return bank;
}

function playParams() {
  return {
    enabled: true,
    volume: Number(vol.value),
    pitchMin: Number(pmin.value),
    pitchMax: Number(pmax.value),
    volumeJitter: 0,
  };
}

function stopBurst(id: string) {
  const timers = burstTimers.get(id) || [];
  for (const t of timers) clearTimeout(t);
  burstTimers.set(id, []);
}

function playOnce(clip: Clip) {
  getBank(clip).play(playParams());
}

function playBurst(clip: Clip) {
  stopBurst(clip.id);
  const n = Math.round(Number(burst.value));
  const interval = Number(gap.value);
  const bank = getBank(clip);
  const timers: number[] = [];
  for (let i = 0; i < n; i++) {
    const id = window.setTimeout(() => bank.play(playParams()), i * interval * 1000);
    timers.push(id);
  }
  burstTimers.set(clip.id, timers);
}

function updatePicksOut() {
  const picked = clips.filter(c => stored.picks.includes(c.id));
  if (!picked.length) {
    picksOut.textContent = '（尚未勾选）';
    return;
  }
  picksOut.textContent = picked
    .map(c => {
      const r = stored.ratings[c.id] || 0;
      return `${c.id}\t★${r}\t${c.title}\t${c.file}\t${c.license}\t${c.url}`;
    })
    .join('\n');
}

function filteredClips() {
  let list = clips.slice();
  const src = srcFilter.value;
  const tag = tagFilter.value;
  if (src !== 'all') list = list.filter(c => c.source === src);
  if (tag !== 'all') list = list.filter(c => c.tags.includes(tag));
  const mode = sortSel.value;
  if (mode === 'duration') {
    list.sort((a, b) => (a.duration ?? 99) - (b.duration ?? 99));
  } else if (mode === 'rating') {
    list.sort((a, b) => (stored.ratings[b.id] || 0) - (stored.ratings[a.id] || 0));
  } else if (mode === 'picked') {
    list.sort((a, b) => Number(stored.picks.includes(b.id)) - Number(stored.picks.includes(a.id)));
  }
  return list;
}

function renderStats(list: Clip[]) {
  const short = list.filter(c => (c.duration ?? 99) <= 1.0).length;
  const picked = list.filter(c => stored.picks.includes(c.id)).length;
  stats.innerHTML = `
    <span class="chip">显示 <b>${list.length}</b> / ${clips.length}</span>
    <span class="chip">≤1s 短促 <b>${short}</b></span>
    <span class="chip">已勾选 <b>${picked}</b></span>
    <span class="chip">播放器 <b>OneShotBank</b></span>
  `;
}

function renderGrid() {
  const list = filteredClips();
  renderStats(list);
  grid.innerHTML = '';
  for (const clip of list) {
    const rating = stored.ratings[clip.id] || 0;
    const picked = stored.picks.includes(clip.id);
    const longish = (clip.duration ?? 0) > 2.5;
    const card = document.createElement('article');
    card.className = `card${picked ? ' picked' : ''}${longish ? ' longish' : ''}`;
    card.dataset.id = clip.id;
    card.innerHTML = `
      <div class="card-top">
        <div>
          <h3>${clip.title}${longish ? ' <span class="tag">偏长</span>' : ''}</h3>
          <p class="sub">${clip.source} · ${clip.author} · ${clip.license} · ${fmtDur(clip.duration)}</p>
        </div>
        <a class="sub" href="${clip.url}" target="_blank" rel="noreferrer">来源</a>
      </div>
      <p class="note">${clip.note}</p>
      <div class="tags">${clip.tags.map(t => `<span class="tag ${tagClass(t)}">${t}</span>`).join('')}</div>
      <div class="card-actions">
        <button type="button" class="primary" data-act="once">播一次</button>
        <button type="button" data-act="burst">连射</button>
        <button type="button" class="ghost" data-act="stop">停连射</button>
      </div>
      <div class="rate" data-rate>
        ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" class="${n <= rating ? 'on' : ''}" aria-label="${n}星">★</button>`).join('')}
        <span class="sub">${rating ? `${rating}/5` : '未评'}</span>
      </div>
      <label class="pick-row">
        <input type="checkbox" data-pick ${picked ? 'checked' : ''}>
        选这个（更好）
      </label>
    `;
    card.querySelector('[data-act="once"]')!.addEventListener('click', () => playOnce(clip));
    card.querySelector('[data-act="burst"]')!.addEventListener('click', () => playBurst(clip));
    card.querySelector('[data-act="stop"]')!.addEventListener('click', () => stopBurst(clip.id));
    card.querySelectorAll('[data-star]').forEach(btn => {
      btn.addEventListener('click', () => {
        const n = Number((btn as HTMLElement).dataset.star);
        stored.ratings[clip.id] = stored.ratings[clip.id] === n ? 0 : n;
        saveStored(stored);
        renderGrid();
        updatePicksOut();
      });
    });
    card.querySelector('[data-pick]')!.addEventListener('change', (ev) => {
      const on = (ev.target as HTMLInputElement).checked;
      stored.picks = stored.picks.filter(id => id !== clip.id);
      if (on) stored.picks.push(clip.id);
      saveStored(stored);
      renderGrid();
      updatePicksOut();
    });
    grid.appendChild(card);
  }
  updatePicksOut();
}

[srcFilter, tagFilter, sortSel].forEach(el => el.addEventListener('change', renderGrid));

document.querySelector('#clear-picks')!.addEventListener('click', () => {
  stored.picks = [];
  saveStored(stored);
  renderGrid();
});
document.querySelector('#clear-ratings')!.addEventListener('click', () => {
  stored.ratings = {};
  saveStored(stored);
  renderGrid();
});

async function boot() {
  try {
    const res = await fetch(manifestUrl);
    if (!res.ok) throw new Error(`无法加载清单 ${manifestUrl} (${res.status})`);
    const data = (await res.json()) as Manifest;
    clips = data.clips || [];
    if (!clips.length) throw new Error('清单为空');
    // Preload short release candidates first for snappy first click
    for (const c of clips.filter(x => x.tags.includes('short') || x.tags.includes('release')).slice(0, 8)) {
      getBank(c);
    }
    renderGrid();
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e));
  }
}

void boot();
