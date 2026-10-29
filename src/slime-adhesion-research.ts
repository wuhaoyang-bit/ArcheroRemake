import './slime-adhesion-research.css';

type Category = 'direct' | 'adapt' | 'reference' | 'commercial';
type Evidence = '符合' | '部分' | '不符' | '未看';
type Link = [label: string, url: string];
type Source = {
  id: string; name: string; subtitle: string; category: Category; priority?: boolean;
  summary: string; usable: string; remaining: string; license: string; checked: string;
  links: Link[]; evidence: [Evidence, Evidence, Evidence, Evidence];
  media?: { type: 'gif' | 'video' | 'vimeo'; url: string; label: string; note: string };
};
const categories: Record<Category, string> = { direct: '可复用部件', adapt: '需改造源码', reference: '仅供参考', commercial: '商业源码' };
const sources: Source[] = [
  {
    id: 'local-tether', name: '我们已有的眼球拉丝', subtitle: 'Archero · EyeHitVisual / EyeHitMotion', category: 'direct', priority: true,
    summary: '离目标最近的工程起点。已有两端较粗、中间随距离变细的网格，还会跟随怪物当前颜色。',
    usable: 'src/eye-hit-visual.ts：动态顶点、宽根细颈与颜色传递；eye-hit-motion.ts：运动状态组织方式。',
    remaining: '改成地面固定端 + 身体移动端；增加断裂封口、分段收回与连续受击处理。现有眼球状态不能原样套用。',
    license: '当前项目已有代码；本项复用自身实现，不引入新外部素材。',
    checked: '已读本地源码。现有每条拉丝 12 × 16 × 2 = 384 个侧面三角形；尚未实现地面黏附。',
    links: [], evidence: ['部分', '符合', '部分', '符合'],
  },
  {
    id: 'local-puddle', name: '我们已有的融合液滩', subtitle: 'Archero · UnifiedSlimeLiquid', category: 'direct', priority: true,
    summary: '承接断开后留在地面的少量液体。现有覆盖场、颜色、融合与消退逻辑都可以继续使用。',
    usable: 'src/unified-slime-liquid.ts 的落地沉积、融合液面和颜色输入路径。',
    remaining: 'land() 目前是私有落地函数，需要新增供黏附效果调用的小面积沉积接口。',
    license: '当前项目已有代码；可在现有系统中扩展。',
    checked: '已读本地源码。已确认残留写入 deposits；并不存在现成的“液桥断裂”调用入口。',
    links: [['查看已有爆开调试页', './slime-burst-lab.html']], evidence: ['部分', '符合', '部分', '符合'],
  },
  {
    id: 'loft', name: 'Three.js · LoftGeometry', subtitle: '程序化截面放样 · 当前项目已安装', category: 'direct', priority: true,
    summary: '将一组截面连成表面。圆形、扁椭圆和宽口截面，可用于把液丝扩展成有厚度的短薄膜。',
    usable: '闭合截面生成管面，开放截面生成带状面；示例展示截面变化。项目 Three.js 0.186.1 中已有此模块。',
    remaining: '增加每帧截面更新、连接点追踪与断裂状态。运行时应复用缓冲，避免反复创建整块几何。',
    license: 'Three.js MIT。它是几何部件，尚不包含黏附或流体模拟。',
    checked: '已读源码、示例和 MIT 许可；示例页面未完整运行核验。',
    links: [['官方示例 ↗', 'https://threejs.org/examples/webgpu_geometry_loft.html'], ['源码 ↗', 'https://github.com/mrdoob/three.js/blob/dev/examples/jsm/geometries/LoftGeometry.js'], ['MIT 许可', 'https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE']],
    evidence: ['未看', '符合', '不符', '符合'],
  },
  {
    id: 'hotshark', name: 'Hotshark4 · 双史莱姆液桥', subtitle: 'Real Time VFX · 游戏视觉参考', category: 'reference', priority: true,
    summary: '最贴近本次目标的形状参考：两端融进液团，中央被拉长、拉薄，弯曲处仍有体积。',
    usable: '参考宽根、细颈和随两端位置变化的轮廓。作者说明连接读取另一端位置，并设有最大距离。',
    remaining: '打开的原帖未提供工程或开源许可；需要自行制作网格、材质和断裂动画。',
    license: '未发现源码授权；原 GIF 只作原作预览，不能视为可用于游戏的素材。',
    checked: '原文已读，GIF 已抽帧：看到拉伸与变细；未在抽查帧中看到完整断裂。断裂部分来自作者文字说明。',
    links: [['作者原帖 ↗', 'https://realtimevfx.com/t/hotshark4-sketchbook/31682'], ['原始 GIF ↗', 'https://realtimevfx.com/uploads/default/original/3X/9/2/92b08c7dc73292815f45e7e0e9554f07f4ca992b.gif']],
    evidence: ['部分', '部分', '符合', '部分'],
    media: { type: 'gif', url: 'https://realtimevfx.com/uploads/default/original/3X/9/2/92b08c7dc73292815f45e7e0e9554f07f4ca992b.gif', label: '播放原作 GIF · 已抽帧', note: 'Hotshark4 原作，由 Real Time VFX 加载。重点看两端的宽根和中央收细。' },
  },
  {
    id: 'coalesce', name: 'Coalesce · 黏性液团系统', subtitle: 'Vicvasper · Unreal Engine 5.6–5.8 / Win64', category: 'commercial', priority: true,
    summary: '覆盖融合、拉丝、断裂与黏附的商业系统。商品明确写有“C++ source included”，目前未找到公开开源仓库。',
    usable: '可通过商品获取附带源码的插件；目前可打开作者提供的免费 Windows 可玩演示入口。',
    remaining: '尚未取得商品包；源码模块与具体许可待核实。移植至 Three.js 需要重接模拟、网格与材质。',
    license: '商业商品，附带源码 ≠ 开源许可。尚未核实跨引擎使用范围。',
    checked: '已核对 Fab、作者发布帖和 12 个公开仓库。未运行 Windows 演示；作者桌面性能数据不代表手机性能。',
    links: [['商品与源码说明 ↗', 'https://www.fab.com/listings/f8ca1cba-d7f3-4d66-bfb8-d57f8e991ca9'], ['Windows 演示入口 ↗', 'https://drive.google.com/file/d/1rog9NqqMhEUpeBs4PQvXd_jOmbhUJKlL/view'], ['作者发布帖', 'https://forums.unrealengine.com/t/vicvasper-coalesce-viscous-blobs-slime-and-goo-real-time/2839268'], ['作者 GitHub', 'https://github.com/vicvasper?tab=repositories']],
    evidence: ['部分', '部分', '符合', '部分'],
  },
  {
    id: 'toji', name: 'WebGPU Metaballs', subtitle: 'toji · 隐式液团与表面生成', category: 'adapt', priority: true,
    summary: '公开的连续液团表面代码。如果以后想让多个液桥和液团真正融成一张表面，这是可研究的代码起点。',
    usable: '隐式场、Marching Cubes 表面提取，以及 CPU / GPU 表面生成和数据上传路径。',
    remaining: '需要移植到 Three.js / TSL；地面黏附、拉伸驱动、断裂回收都需新增。比短液桥网格的范围大。',
    license: '相关源码文件头含 MIT 声明；已核实。',
    checked: '已读 metaballs.js 和 WebGPU 渲染源码；未验证完整示例在本机或 APK 上的表现。',
    links: [['运行原示例 ↗', 'https://toji.github.io/webgpu-metaballs/'], ['仓库 ↗', 'https://github.com/toji/webgpu-metaballs'], ['源码与 MIT 声明', 'https://raw.githubusercontent.com/toji/webgpu-metaballs/main/js/metaballs.js'], ['渲染器源码', 'https://raw.githubusercontent.com/toji/webgpu-metaballs/main/js/webgpu-renderer/webgpu-metaball-renderer.js']],
    evidence: ['未看', '符合', '不符', '部分'],
  },
  {
    id: 'sam', name: 'Sam · 黏液网格动画', subtitle: 'Sam Perzanowski · 原作者拆解', category: 'reference',
    summary: '用网格、顶点动画和顶点色制作黏液流动与气泡。适合研究“哪一部分动，哪一部分留在原处”。',
    usable: '顶点色 / 遮罩约束固定区域；用不同形变控制鼓起、宽度和高度。可借鉴到薄膜根部。',
    remaining: '不是现成的击退黏地效果；打开的原帖未提供可直接下载的完整工程。',
    license: '未核实可复用源码或素材的许可。',
    checked: '已读作者拆解；找到对应黏液 Vimeo 入口，但未完整播放核验。',
    links: [['作者拆解 ↗', 'https://realtimevfx.com/t/vfx-experiments-personal-wip-sam-perzanowski/1278'], ['黏液原视频 ↗', 'https://player.vimeo.com/video/194765114?app_id=122963&h=d3727670c9']],
    evidence: ['部分', '符合', '部分', '部分'],
    media: { type: 'vimeo', url: 'https://player.vimeo.com/video/194765114?h=d3727670c9', label: '尝试加载原视频 · 未完整核验', note: '第三方播放器可能限制嵌入；无法播放时请打开黏液原视频。' },
  },
  {
    id: 'obi-contact', name: 'Obi · 接触黏附', subtitle: '官方 Collision Materials 文档', category: 'reference',
    summary: '把黏附、摩擦与脱离距离分开解释，帮助我们设计地面端什么时候留下、什么时候松开。',
    usable: 'Stickiness 是接触法线方向的黏附作用；Stick Distance 控制作用距离，区别于切向摩擦。',
    remaining: '这是 Unity 插件机制说明；我们需要实现自己的连接点与脱离阈值。',
    license: '文档参考；本轮未取得可直接用于本项目的开放源码。',
    checked: '已读官方原文；文档中的黏附示例不等于本次液桥效果。',
    links: [['官方原文 ↗', 'https://obi.virtualmethodstudio.com/manual/7.1/collisionmaterials.html']], evidence: ['部分', '部分', '符合', '部分'],
  },
  {
    id: 'obi-viscosity', name: 'Obi · 黏度与表面张力', subtitle: '官方 Emitter Blueprints 文档', category: 'reference',
    summary: '内部黏度、表面张力与物体表面的黏附是不同因素。仅提高液体黏度不保证出现地面拉丝。',
    usable: '用于区分视觉参数职责，并理解分辨率、时间步和求解次数对成本的影响。',
    remaining: '需要在我们采用的视觉近似中定义独立参数，不直接搬用物理解算数值。',
    license: '文档参考；没有核实可复用的开放实现。',
    checked: '已读官方原文。没有据此断言高黏度模拟无法实时运行。',
    links: [['官方原文 ↗', 'https://obi.virtualmethodstudio.com/manual/7.1/emittermaterials.html']], evidence: ['部分', '符合', '部分', '部分'],
  },
  {
    id: 'three-compute', name: 'Three.js · Compute Geometry', subtitle: '官方 WebGPU 几何更新示例', category: 'adapt',
    summary: '展示在 WebGPU 上更新几何与受力回弹。可研究大量形变的更新路径，不包含液体断裂。',
    usable: '存储缓冲、几何节点与计算更新的组织方式。',
    remaining: '需要重新实现液桥形状与连接状态；少量短液桥可先用现有 CPU 顶点更新方式。',
    license: 'Three.js MIT。',
    checked: '已读示例源码，未运行验证；示例中的弹性回位不能直接当作黏液运动。',
    links: [['官方示例 ↗', 'https://threejs.org/examples/webgpu_compute_geometry'], ['示例源码 ↗', 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgpu_compute_geometry.html'], ['MIT 许可', 'https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE']],
    evidence: ['未看', '符合', '部分', '符合'],
  },
  {
    id: 'three-buffer', name: 'Three.js · 动态顶点缓冲', subtitle: 'BufferAttribute · 基础代码', category: 'direct',
    summary: '适合首版少量液桥的基础设施：复用缓冲，每帧写入位置，并通知渲染器更新。',
    usable: 'DynamicDrawUsage、needsUpdate 与更新范围；现有眼球拉丝已经采用相近路径。',
    remaining: '控制更新数量，生成正确法线，并避免运行时反复分配几何与临时对象。',
    license: 'Three.js MIT。',
    checked: '已读源码及许可；没有进行本次新效果的性能测量。',
    links: [['BufferAttribute 源码 ↗', 'https://raw.githubusercontent.com/mrdoob/three.js/dev/src/core/BufferAttribute.js'], ['MIT 许可', 'https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE']], evidence: ['不符', '符合', '不符', '符合'],
  },
  {
    id: 'samples', name: 'WebGPU Samples · Metaballs 入口', subtitle: '示例索引 · 补充入口', category: 'reference',
    summary: '作为 WebGPU 液团示例的检索入口。代码选择以已经打开核对的具体仓库为准。',
    usable: '查找浏览器实时液团演示和相关链接。',
    remaining: '此入口只读取到页面外壳，未据此确认具体算法或许可。',
    license: '本入口未核实；不要与 toji 源码文件头的 MIT 声明混为一谈。',
    checked: '入口已打开，实际演示未运行。',
    links: [['示例入口 ↗', 'https://webgpu.github.io/webgpu-samples/?sample=metaballs']], evidence: ['未看', '部分', '未看', '部分'],
  },
  {
    id: 'qian', name: '拉伸液桥与残留液滴', subtitle: 'Qian & Breuer · 原始研究', category: 'reference',
    summary: '描述液桥拉长、底部接触线退缩、细颈失稳与断裂，随后在基底留下液滴的过程。',
    usable: '作为动作阶段与残留位置的物理参照。',
    remaining: '是实验尺度的液桥研究；游戏的时间、大小和史莱姆材料需要独立设计。',
    license: '论文参考；不提供可直接接入 Three.js 的效果模块。',
    checked: '已读论文原文与图注；未把图注当作已播放的动画。',
    links: [['论文原文 ↗', 'https://arxiv.org/html/1010.2562v1'], ['论文摘要', 'https://arxiv.org/abs/1010.2562']], evidence: ['部分', '部分', '符合', '不符'],
  },
  {
    id: 'bridge2d', name: 'LiquidBridge2D', subtitle: 'rcsc-group · Basilisk C 科研模拟', category: 'adapt',
    summary: '有公开的液桥模拟源码，可以研究接触条件与液面演化。它不是轻量网页效果模块。',
    usable: '查看圆柱之间液桥的接触角设置、边界条件和数值模拟组织。',
    remaining: '依赖 Basilisk 的科研求解流程；转成网页游戏的工作量大，首版仅建议用于机制研究。',
    license: '仓库 MIT 已核实；依赖的许可未全部核对。',
    checked: '已读驱动源码与仓库许可；未在游戏运行。',
    links: [['仓库 ↗', 'https://github.com/rcsc-group/LiquidBridge2D'], ['驱动源码', 'https://raw.githubusercontent.com/rcsc-group/LiquidBridge2D/main/DriverCode/liquid_bridge_Fr.c'], ['MIT 许可', 'https://raw.githubusercontent.com/rcsc-group/LiquidBridge2D/main/LICENSE']], evidence: ['部分', '符合', '符合', '部分'],
  },
  {
    id: 'jfm', name: '水平圆柱之间的液桥', subtitle: 'Journal of Fluid Mechanics · 补充动画', category: 'reference',
    summary: '液桥在重力等条件下变形的数值动画。适合观察形状变化，本次抽帧没有看到断裂。',
    usable: '参考液体在接触区域的弯曲与贴附轮廓。',
    remaining: '不能用这两段动画证明“断裂后回收”；此缺口另由 APS / PNAS 原文与视频入口补充。',
    license: '作为论文原站预览；未将视频认定为可用于游戏的素材。',
    checked: 'Movie 5 / 6 已下载抽帧；它们均未提供本次所需的完整断裂画面。',
    links: [['论文与补充材料 ↗', 'https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/liquid-bridges-between-horizontal-cylinders-effects-of-gravity-and-electric-fields/D9E6ABA5CC15409F779468054714BA81'], ['Movie 6 原视频 ↗', 'https://static.cambridge.org/content/id/urn%3Acambridge.org%3Aid%3Aarticle%3AS0022112026120357/resource/name/S0022112026120357sup006.mp4']],
    evidence: ['部分', '部分', '部分', '不符'],
    media: { type: 'video', url: 'https://static.cambridge.org/content/id/urn%3Acambridge.org%3Aid%3Aarticle%3AS0022112026120357/resource/name/S0022112026120357sup005.mp4', label: '加载 Movie 5 · 变形参考', note: '原论文补充动画；已抽帧，未观察到断裂。另一段可通过 Movie 6 链接打开。' },
  },
  {
    id: 'aps', name: '黏性复合液丝的碎裂', subtitle: 'Thievenaz / Sauret · APS Gallery of Fluid Motion', category: 'reference',
    summary: '作者用视频描述黏性液桥被拉伸为细丝，再碎裂为多个液滴的过程。',
    usable: '打开原视频后，可重点观察细颈、断裂位置与小液滴的形成。',
    remaining: '本次播放器受限，未实际观看核验；实验不是史莱姆击退场景。',
    license: '作品页标明 CC BY-NC 4.0；本页提供原站链接，不作为游戏资产。',
    checked: '已读作者原文与许可声明，找到视频入口；未声称已观看。',
    links: [['原作与视频入口 ↗', 'https://gfm.aps.org/meetings/dfd-2021/61445a55199e4c7029f44fde'], ['YouTube 原视频 ↗', 'https://www.youtube.com/watch?v=jVvaOpTXblI']], evidence: ['部分', '部分', '部分', '不符'],
  },
  {
    id: 'pnas', name: '黏弹性液桥的扭转断裂', subtitle: 'PNAS · 实验与数值分析', category: 'reference',
    summary: '提供液桥细颈断裂的实验、数值分析与补充视频，部分实验通过旋转触发断裂。',
    usable: '研究细颈如何收缩与断开；区分拉伸触发和扭转触发。',
    remaining: '不能直接照搬旋转实验作为击退运动。视频下载遭遇访问检查，未完成播放核验。',
    license: '原文参考；本轮没有取得适用于项目的效果源码。',
    checked: '已读取原文与视频说明；媒体未成功播放。',
    links: [['论文与补充视频 ↗', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8214669/']], evidence: ['部分', '部分', '符合', '不符'],
  },
  {
    id: 'ukfluids', name: '滴落、细颈断裂与回缩', subtitle: 'Andrew Edwards · UK Fluids Network', category: 'reference',
    summary: 'Complexity of Simple Dripping 提供滴落过程的时序图像，包含细颈、断裂与回缩阶段。',
    usable: '补充观察动作先后关系；这是水滴参考，材料表现与黏弹性史莱姆不同。',
    remaining: '未取得完整动画或效果代码。',
    license: '原作者图像参考，未核实可用于游戏的素材许可。',
    checked: '已读站点原文，确认该入口为时序图片，未把它当作已观看视频。',
    links: [['作者作品所在页面 ↗', 'https://fluids.ac.uk/']], evidence: ['部分', '不符', '部分', '不符'],
  },
];

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function makeLink([label, url]: Link, className = '') {
  const node = element('a', className, label);
  node.href = url; node.target = '_blank'; node.rel = 'noopener noreferrer';
  return node;
}
const cardsContainer = document.querySelector<HTMLDivElement>('#source-cards')!;
const cards: { source: Source; card: HTMLElement; resetMedia: () => void }[] = [];
const evidenceRows = document.querySelector<HTMLTableSectionElement>('#evidence-rows')!;
const evidenceClass = { '符合': 'yes', '部分': 'partial', '不符': 'no', '未看': 'unseen' };

for (const [index, source] of sources.entries()) {
  const number = String(index + 1).padStart(2, '0');
  const card = element('article', 'source-card'); card.id = `source-${source.id}`;
  const head = element('div', 'card-head');
  const top = element('div', 'card-top');
  top.append(element('span', 'source-id', `REF / ${number}`), element('span', `badge ${source.category}`, categories[source.category]));
  head.append(top, element('h3', '', source.name), element('p', 'card-subtitle', source.subtitle));
  const body = element('div', 'card-body');
  body.append(element('p', 'card-summary', source.summary));
  const facts = element('dl', 'fact-list');
  for (const [label, content] of [['能用什么', source.usable], ['要补什么', source.remaining], ['源码许可', source.license]]) {
    facts.append(element('dt', '', label), element('dd', '', content));
  }
  body.append(facts, element('p', 'card-status', `核验范围 · ${source.checked}`));
  let resetMedia = () => {};
  if (source.media) {
    const media = source.media;
    const shell = element('div', 'preview-shell');
    const toggle = element('button', 'preview-trigger', `${media.label}　▷`); toggle.type = 'button';
    const box = element('div', 'preview-box'); box.id = `preview-${source.id}`; box.hidden = true;
    toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', box.id);
    const note = element('p', 'preview-note', media.note);
    resetMedia = () => {
      const video = box.querySelector('video');
      if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
      box.replaceChildren(); box.hidden = true; toggle.textContent = `${media.label}　▷`;
      toggle.setAttribute('aria-expanded', 'false');
    };
    toggle.addEventListener('click', () => {
      if (!box.hidden) { resetMedia(); return; }
      box.hidden = false; toggle.textContent = '关闭预览　×'; toggle.setAttribute('aria-expanded', 'true');
      const failure = () => {
        box.replaceChildren(element('p', 'preview-message', '原站媒体加载失败。请使用下方的原作链接查看。'));
      };
      if (media.type === 'gif') {
        const image = element('img'); image.alt = `${source.name}原作：两端黏液团之间的连接被拉长、拉细`;
        image.addEventListener('error', failure, { once: true }); image.src = media.url; box.append(image);
      } else if (media.type === 'video') {
        const video = element('video'); video.controls = true; video.playsInline = true; video.preload = 'metadata';
        video.setAttribute('aria-label', source.name); video.addEventListener('error', failure, { once: true });
        video.src = media.url; box.append(video);
      } else {
        const frame = element('iframe'); frame.title = `${source.name}原始视频`; frame.allowFullscreen = true;
        frame.allow = 'fullscreen; picture-in-picture'; frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.src = media.url; box.append(frame);
      }
    });
    shell.append(toggle, box, note); body.append(shell);
  }
  if (source.links.length) {
    const actions = element('div', 'card-actions');
    for (const link of source.links) actions.append(makeLink(link, 'button'));
    body.append(actions);
  }
  card.append(head, body); cardsContainer.append(card); cards.push({ source, card, resetMedia });
  const row = element('tr'); const name = element('td');
  name.append(source.links.length ? makeLink([source.name, source.links[0][1]]) : document.createTextNode(source.name));
  row.append(name);
  for (const value of source.evidence) row.append(element('td', `evidence-value ${evidenceClass[value]}`, value));
  evidenceRows.append(row);
}
const unread = element('tr');
const unreadName = element('td'); unreadName.append(document.createTextNode('未成功读取的候选：'));
for (const [i, link] of ([
  ['threejs-components', 'https://github.com/klevron/threejs-components'],
  ['旧 BufferAttribute 文档', 'https://threejs.org/docs/BufferAttribute.html'],
  ['旧优化文档', 'https://threejs.org/manual/en/optimize-lots-of-objects.html'],
  ['锥形液桥论文', 'https://pubs.rsc.org/en/content/articlehtml/2023/ra/d3ra01140b'],
] as Link[]).entries()) { if (i) unreadName.append('、'); unreadName.append(makeLink(link)); }
unread.append(unreadName);
for (let i = 0; i < 4; i++) unread.append(element('td', 'evidence-value unseen', '未看'));
evidenceRows.append(unread);

let filter = 'priority';
const search = document.querySelector<HTMLInputElement>('#source-search')!;
function applyFilter() {
  const query = search.value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const { source, card, resetMedia } of cards) {
    const categoryMatches = filter === 'all' || (filter === 'priority' ? source.priority : source.category === filter);
    const haystack = [source.name, source.subtitle, source.summary, source.usable, source.remaining, source.license, categories[source.category]].join(' ').toLocaleLowerCase();
    const matches = !!categoryMatches && (!query || haystack.includes(query));
    card.hidden = !matches;
    if (!matches) resetMedia(); else visible++;
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-filter]')) button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
  document.querySelector('#source-count')!.textContent = `显示 ${visible} / ${sources.length} 项来源 · “可复用部件”仍需组装，不等于完整效果可直接安装。`;
  document.querySelector<HTMLElement>('#empty-state')!.hidden = visible !== 0;
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-filter]')) button.addEventListener('click', () => { filter = button.dataset.filter!; applyFilter(); });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-quick-filter]')) button.addEventListener('click', () => {
  filter = button.dataset.quickFilter!; search.value = ''; applyFilter(); document.querySelector('#sources')!.scrollIntoView();
});
search.addEventListener('input', applyFilter); applyFilter();

// A deliberately schematic SVG, separate from the game's renderer and simulation.
const motionShape = document.querySelector<SVGGElement>('#motion-shape')!;
const progress = document.querySelector<HTMLInputElement>('#motion-progress')!;
const play = document.querySelector<HTMLButtonElement>('#play-motion')!;
const phaseLabels = ['黏住', '拉薄', '断开', '留痕'];
const descriptions = ['身体开始移动，旧接触点短暂留在原地。', '身体继续后退，宽根之间拉出越来越细的液桥。', '细颈断开；身体端缩回，地面端向下塌。', '地面留下少量湿痕，身体恢复自由移动。'];
const phaseStarts = [0.08, 0.41, 0.74, 0.96];
let playing = false; let frame = 0; let current = 0.41; let startTime = 0;
function drawMotion(p: number) {
  current = Math.max(0, Math.min(1, p));
  const stage = current < 0.18 ? 0 : current < 0.66 ? 1 : current < 0.85 ? 2 : 3;
  const stretch = Math.min(current / 0.66, 1);
  const cx = 185 + stretch * 220; const root = cx - 49;
  const neckX = (157 + root) / 2; const neckY = 214 - 9 * stretch;
  const thickness = 22 * (1 - stretch) + 1.2;
  const base = '<ellipse cx="157" cy="235" rx="31" ry="6" fill="#8caf70" opacity=".75"/><ellipse cx="153" cy="233" rx="19" ry="2.4" fill="#d9eda6" opacity=".42"/>';
  let bridge = '';
  if (stage < 2) {
    bridge = `<path d="M126 235 Q145 230 155 214 Q${(157 + neckX) / 2} ${neckY - thickness} ${neckX} ${neckY - thickness} Q${root - 22} ${neckY - thickness} ${root + 12} 184 L${root + 28} 233 Q${root - 22} ${neckY + thickness} ${neckX} ${neckY + thickness} Q178 230 182 235Z" fill="url(#gel)"/><path d="M150 224 Q${neckX} ${neckY - thickness + 7} ${root + 15} 202" fill="none" stroke="#ebf7bf" stroke-width="2.5" stroke-opacity=".55"/>`;
  } else if (stage === 2) {
    const recoil = (current - 0.66) / 0.19; const leftX = neckX - recoil * (neckX - 170); const rightX = neckX + recoil * (root - neckX);
    bridge = `<path d="M127 235 Q150 225 154 215 Q${leftX - 14} 220 ${leftX} ${neckY + recoil * 23} Q${leftX - 14} 235 182 235Z" fill="url(#gel)"/><path d="M${root + 12} 184 Q${root - 14} 208 ${rightX} ${neckY} Q${rightX - 3} ${neckY + 12} ${root + 25} 233Z" fill="url(#gel)"/>`;
  }
  const body = `<ellipse cx="${cx + 5}" cy="239" rx="83" ry="8" fill="#0f241c" opacity=".4"/><path d="M${cx - 82} 227 C${cx - 91} 207 ${cx - 67} 179 ${cx - 64} 157 C${cx - 62} 111 ${cx - 29} 95 ${cx + 9} 109 C${cx + 47} 108 ${cx + 68} 145 ${cx + 67} 176 C${cx + 69} 196 ${cx + 91} 215 ${cx + 78} 230 C${cx + 44} 242 ${cx - 48} 239 ${cx - 82} 227Z" fill="url(#gel)"/><path d="M${cx - 47} 146 Q${cx - 32} 117 ${cx - 6} 122" fill="none" stroke="#f2fad6" stroke-width="9" stroke-linecap="round" opacity=".7"/><ellipse cx="${cx + 16}" cy="163" rx="10" ry="13" fill="#f2f4de"/><ellipse cx="${cx + 45}" cy="164" rx="9" ry="12" fill="#f2f4de"/><ellipse cx="${cx + 19}" cy="164" rx="4" ry="6" fill="#334d3d"/><ellipse cx="${cx + 48}" cy="165" rx="4" ry="6" fill="#334d3d"/>`;
  motionShape.innerHTML = base + bridge + body;
  progress.value = String(Math.round(current * 1000));
  progress.setAttribute('aria-valuetext', `${Math.round(current * 100)}%，${phaseLabels[stage]}`);
  document.querySelector('#motion-label')!.textContent = phaseLabels[stage];
  document.querySelector('#phase-description')!.textContent = descriptions[stage];
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-phase]')) button.setAttribute('aria-pressed', String(Number(button.dataset.phase) === stage));
}
function pauseMotion() { playing = false; cancelAnimationFrame(frame); play.textContent = '播放'; play.setAttribute('aria-label', '播放动作示意'); }
function tick(time: number) {
  if (!playing) return;
  drawMotion((time - startTime) / 4200);
  if (current >= 1) pauseMotion(); else frame = requestAnimationFrame(tick);
}
play.addEventListener('click', () => {
  if (playing) { pauseMotion(); return; }
  if (current >= 0.99) drawMotion(0);
  playing = true; play.textContent = '暂停'; play.setAttribute('aria-label', '暂停动作示意');
  startTime = performance.now() - current * 4200; frame = requestAnimationFrame(tick);
});
progress.addEventListener('input', () => { pauseMotion(); drawMotion(Number(progress.value) / 1000); });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-phase]')) button.addEventListener('click', () => { pauseMotion(); drawMotion(phaseStarts[Number(button.dataset.phase)]); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseMotion(); for (const card of cards) card.resetMedia(); } });
drawMotion(current);
