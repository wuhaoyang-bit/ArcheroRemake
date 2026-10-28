import './settings-sidebar.css';
export type SidebarCategory={id:string;label:string;sections:string[]};
/** Explicit newest-first feature order; moving existing controls preserves handlers and draft values. */
export const GAME_SIDEBAR_CATEGORIES:SidebarCategory[]=[
 {id:'shooting',label:'射箭 · 特效与后坐力',sections:['箭头 · 颜料球','出箭特效 · 环带与尖刺','箭矢拖尾','射击后坐力','弓与箭']},
 {id:'slime',label:'史莱姆 · 充盈与行走',sections:['史莱姆 · 充盈变色与行走','史莱姆 · 注入与弹性鼓胀','怪物训练场']},
 {id:'puddle',label:'地面液体 · 外观与展开',sections:['撑爆 · 液体残留']},
 {id:'burst',label:'怪物爆炸 · 动画与特效',sections:['史莱姆 · 蓄爆','撑爆 · 六层特效']},
 {id:'camera-zoom',label:'屏幕伸缩',sections:['屏幕伸缩 · Out → 阻尼弹簧']},
 {id:'hit',label:'受击 · 反馈与调试',sections:['训练场 · 受击反馈','箭矢命中调试']},
 {id:'locking',label:'锁定 · 选敌、转向与圆环',sections:['锁定圆环 UI','旋转角速度－锁定','目标锁定']},
 {id:'movement',label:'移动 · 角色、轮盘与锚点',sections:['轮盘与锚点','锚点防抖','角色','移动速度模型','朝向调试']},
 {id:'scene',label:'场景 · 房间与镜头',sections:['房间与镜头']},
];
export function createSettingsSidebar(content:HTMLElement,sections:HTMLElement[],categories:SidebarCategory[],id:string){
 const names=new Map(sections.map(section=>[section.querySelector('h2,summary')!.textContent!.trim(),section]));
 const assigned=new Set<string>();const panels:{category:SidebarCategory;panel:HTMLElement}[]=[];
 const add=(category:SidebarCategory)=>{const nodes=category.sections.flatMap(name=>{const node=names.get(name);if(!node)return [];assigned.add(name);return [node];});if(!nodes.length)return;const panel=document.createElement('div');panel.className='settings-category';panel.id=`${id}-${category.id}`;panel.dataset.category=category.id;panel.setAttribute('role','region');panel.setAttribute('aria-label',category.label);panel.append(...nodes);content.append(panel);panels.push({category,panel});};
 categories.forEach(add);
 const remaining=[...names.keys()].filter(name=>!assigned.has(name));if(remaining.length)add({id:'other',label:'其他参数',sections:remaining});
 const nav=document.createElement('div');nav.className='settings-category-nav';const label=document.createElement('label');label.htmlFor=id;label.textContent='侧边栏类型';const select=document.createElement('select');select.id=id;select.setAttribute('aria-label','侧边栏类型');for(const {category} of panels){const option=document.createElement('option');option.value=category.id;option.textContent=category.label;select.append(option);}const hint=document.createElement('p');hint.textContent='按板块加入顺序排列 · 最新在上';nav.append(label,select,hint);content.before(nav);
 const storageKey=`archero.sidebar.${id}`;try{const saved=sessionStorage.getItem(storageKey);if(panels.some(p=>p.category.id===saved))select.value=saved!;}catch{/* Preferences are optional. */}
 const show=()=>{for(const {category,panel} of panels)panel.hidden=category.id!==select.value;const active=panels.find(p=>p.category.id===select.value)!;select.setAttribute('aria-controls',active.panel.id);content.scrollTop=0;try{sessionStorage.setItem(storageKey,select.value);}catch{}content.dispatchEvent(new CustomEvent('sidebar-change',{bubbles:true}));};
 select.addEventListener('change',show);show();return select;
}
