import { OneShotBank, type PitchVolume } from './sfx.ts';
import { SFX_DEFAULTS } from './sfx-config.ts';
import './slime-burst-sfx-lab.css';

type Rating = 'like' | 'meh' | 'nope' | '';

type Candidate = {
  id: string;
  title: string;
  group: string;
  groupLabel: string;
  source: string;
  url: string;
  license: string;
  tags: string[];
  file: string;
  durationMs: number;
};

const STORAGE_KEY = 'archero.slimeBurstSfxRatings.v3';
const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'stretch', label: '橡胶撑起' },
  { id: 'inflate', label: '撑胀充气' },
  { id: 'rub', label: '摩擦扭拧' },
  { id: 'elastic', label: '橡皮筋/弹性' },
  { id: 'tension', label: '紧绷尖啸' },
  { id: 'like', label: '只看喜欢' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

const app = document.querySelector('#app')!;
app.innerHTML = `
  <header>
    <div>
      <h1>史莱姆蓄爆 · 橡胶撑起音效试听</h1>
      <p>对齐项目 <code>winding</code> 阶段（蓄爆 · 鼓面撑大，默认约 1.2s）。这批候选主题是<strong>橡胶即将撑爆 / 橡胶撑起来</strong>：膜面拉伸吱吱、摩擦扭拧、紧绷尖啸，不是腹压咕噜也不是落地 splat。播放走 <code>OneShotBank</code>。先点「播放」解锁音频。</p>
      <div class="meta">
        <a href="./slime-burst-lab.html">爆开调试页</a>
        <a href="./audio/slime-burst-candidates/CREDITS.md">素材许可 CREDITS</a>
        <span id="count"></span>
      </div>
    </div>
  </header>
  <div class="toolbar">
    <label>音量 <input id="volume" type="range" min="0" max="1" step="0.01"><span class="readout" id="volume-out"></span></label>
    <label>音高下限 <input id="pitch-min" type="range" min="-12" max="12" step="0.1"><span class="readout" id="pitch-min-out"></span></label>
    <label>音高上限 <input id="pitch-max" type="range" min="-12" max="12" step="0.1"><span class="readout" id="pitch-max-out"></span></label>
    <label>音量抖动 <input id="jitter" type="range" min="0" max="0.5" step="0.01"><span class="readout" id="jitter-out"></span></label>
    <label><input id="pitch-lock" type="checkbox"> 锁定音高（便于公平对比）</label>
    <button type="button" id="reset-ratings">清空评分</button>
    <div class="filters" id="filters"></div>
    <div id="status"></div>
  </div>
  <main id="main"></main>
`;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const volumeInput = el<HTMLInputElement>('volume');
const pitchMinInput = el<HTMLInputElement>('pitch-min');
const pitchMaxInput = el<HTMLInputElement>('pitch-max');
const jitterInput = el<HTMLInputElement>('jitter');
const pitchLock = el<HTMLInputElement>('pitch-lock');
const statusEl = el<HTMLElement>('status');
const mainEl = el<HTMLElement>('main');
const filtersEl = el<HTMLElement>('filters');
const countEl = el<HTMLElement>('count');

volumeInput.value = String(SFX_DEFAULTS.sfxSlimeHitVolume);
pitchMinInput.value = String(SFX_DEFAULTS.sfxSlimeHitPitchMin);
pitchMaxInput.value = String(SFX_DEFAULTS.sfxSlimeHitPitchMax);
jitterInput.value = String(SFX_DEFAULTS.sfxSlimeHitVolumeJitter);

function syncReadouts() {
  el('volume-out').textContent = Number(volumeInput.value).toFixed(2);
  el('pitch-min-out').textContent = `${Number(pitchMinInput.value).toFixed(1)}st`;
  el('pitch-max-out').textContent = `${Number(pitchMaxInput.value).toFixed(1)}st`;
  el('jitter-out').textContent = `±${(Number(jitterInput.value) * 100).toFixed(0)}%`;
}
syncReadouts();
for (const input of [volumeInput, pitchMinInput, pitchMaxInput, jitterInput]) {
  input.addEventListener('input', syncReadouts);
}

pitchLock.addEventListener('change', () => {
  if (pitchLock.checked) {
    pitchMinInput.value = '0';
    pitchMaxInput.value = '0';
    jitterInput.value = '0';
  } else {
    pitchMinInput.value = String(SFX_DEFAULTS.sfxSlimeHitPitchMin);
    pitchMaxInput.value = String(SFX_DEFAULTS.sfxSlimeHitPitchMax);
    jitterInput.value = String(SFX_DEFAULTS.sfxSlimeHitVolumeJitter);
  }
  syncReadouts();
});

function loadRatings(): Record<string, Rating> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, Rating>;
  } catch {
    return {};
  }
}
function saveRatings(map: Record<string, Rating>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

let ratings = loadRatings();
let filter: FilterId = 'all';
let catalog: Candidate[] = [];
const banks = new Map<string, OneShotBank>();

function playParams(): PitchVolume {
  return {
    enabled: true,
    volume: Number(volumeInput.value),
    pitchMin: Number(pitchMinInput.value),
    pitchMax: Number(pitchMaxInput.value),
    volumeJitter: Number(jitterInput.value),
  };
}

function bankFor(c: Candidate) {
  let bank = banks.get(c.id);
  if (!bank) {
    const url = `${import.meta.env.BASE_URL}audio/slime-burst-candidates/${c.file}`;
    bank = new OneShotBank([url], 2, false);
    bank.bindUnlock(document);
    bank.preload();
    banks.set(c.id, bank);
  }
  return bank;
}

function setStatus(text: string) {
  statusEl.textContent = text;
}

function setRating(id: string, value: Rating) {
  if (value) ratings[id] = value;
  else delete ratings[id];
  saveRatings(ratings);
  render();
}

function visible(c: Candidate) {
  if (filter === 'all') return true;
  if (filter === 'like') return ratings[c.id] === 'like';
  return c.group === filter;
}

function renderFilters() {
  filtersEl.innerHTML = FILTERS.map(
    f => `<button type="button" data-filter="${f.id}" class="${filter === f.id ? 'active' : ''}">${f.label}</button>`,
  ).join('');
  filtersEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      filter = (btn as HTMLButtonElement).dataset.filter as FilterId;
      render();
    });
  });
}

function render() {
  renderFilters();
  const shown = catalog.filter(visible);
  const likeN = catalog.filter(c => ratings[c.id] === 'like').length;
  countEl.textContent = `共 ${catalog.length} 条 · 当前显示 ${shown.length} · 已标喜欢 ${likeN}`;

  const byGroup = new Map<string, Candidate[]>();
  for (const c of shown) {
    const list = byGroup.get(c.groupLabel) ?? [];
    list.push(c);
    byGroup.set(c.groupLabel, list);
  }

  mainEl.innerHTML = '';
  for (const [label, items] of byGroup) {
    const section = document.createElement('section');
    section.className = 'group';
    section.innerHTML = `<h2>${label}</h2><p class="lead">${items[0]?.source ?? ''}${items[0]?.url ? ` · <a href="${items[0].url}" target="_blank" rel="noreferrer">来源页</a>` : ''}</p>`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const c of items) {
      const rating = ratings[c.id] || '';
      const card = document.createElement('article');
      card.className = `card${rating ? ` rating-${rating}` : ''}`;
      card.innerHTML = `
        <h3>${c.title}</h3>
        <div class="sub">${c.file} · ${c.license}</div>
        <div class="tags">${c.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
        <div class="row">
          <button type="button" class="primary" data-play>播放</button>
          <button type="button" class="like ${rating === 'like' ? 'active' : ''}" data-rate="like">喜欢</button>
          <button type="button" class="meh ${rating === 'meh' ? 'active' : ''}" data-rate="meh">一般</button>
          <button type="button" class="nope ${rating === 'nope' ? 'active' : ''}" data-rate="nope">淘汰</button>
          <span class="dur">${(c.durationMs / 1000).toFixed(2)}s</span>
        </div>
      `;
      card.querySelector<HTMLButtonElement>('[data-play]')!.onclick = () => {
        bankFor(c).play(playParams());
        setStatus(`正在播：${c.title}`);
      };
      card.querySelectorAll<HTMLButtonElement>('[data-rate]').forEach(btn => {
        btn.onclick = () => {
          const next = btn.dataset.rate as Rating;
          setRating(c.id, ratings[c.id] === next ? '' : next);
        };
      });
      grid.appendChild(card);
    }
    section.appendChild(grid);
    mainEl.appendChild(section);
  }

  const foot = document.createElement('footer');
  foot.innerHTML = `评分保存在本机 localStorage（${STORAGE_KEY}）。挑完后告诉我喜欢的 id，再接到爆开流程。`;
  mainEl.appendChild(foot);
}

el<HTMLButtonElement>('reset-ratings').onclick = () => {
  if (!confirm('清空全部评分？')) return;
  ratings = {};
  saveRatings(ratings);
  render();
  setStatus('已清空评分');
};

async function boot() {
  setStatus('加载候选目录…');
  const res = await fetch(`${import.meta.env.BASE_URL}audio/slime-burst-candidates/catalog.json`);
  if (!res.ok) throw new Error(`无法加载 catalog.json (${res.status})`);
  catalog = await res.json() as Candidate[];
  // Preload first few so first click is snappy
  for (const c of catalog.slice(0, 8)) bankFor(c);
  render();
  setStatus(`已加载 ${catalog.length} 条候选。点播放解锁音频。`);
}

boot().catch(err => {
  console.error(err);
  setStatus(String(err));
});
