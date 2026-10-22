/** Ground circles stay independent of visual squash. */
export const DUMMY_RADIUS = 1.3;
export type MonsterTarget = {id:string;label:string;x:number;z:number};
type Point = {x:number;z:number};

function clampSpawn(p:Point,width:number,length:number):Point{
  const ex=width/2-.155-DUMMY_RADIUS,ez=length/2-.155-DUMMY_RADIUS;
  return {x:Math.max(-ex,Math.min(ex,p.x)),z:Math.max(-ez,Math.min(ez,p.z))};
}

/** Default two-spider layout, then random fills near existing anchors. */
export function monsterTargets(width:number,length:number,count=2,player:Point={x:0,z:0},playerRadius=0.46):MonsterTarget[]{
  const n=Math.max(1,Math.min(10,Math.round(count)));
  const base:MonsterTarget[]=[-1,1].map((side,i)=>({
    id:`monster-${i+1}`,label:`蜘蛛 ${i+1}`,
    x:side*Math.min(3,width/2-1.5),z:-Math.min(6,length/2-1.5),
  }));
  const targets=base.slice(0,Math.min(n,base.length)).map(t=>({...t,...clampSpawn(t,width,length)}));
  while(targets.length<n)targets.push(spawnNearMonsters(targets,player,playerRadius,width,length,targets.length));
  separateMonsters(targets,player,playerRadius,width,length);
  return targets;
}

/** Place one new monster near existing ones; avoid overlaps and the player. */
export function spawnNearMonsters(existing:Point[],player:Point,playerRadius:number,width:number,length:number,index:number):MonsterTarget{
  const anchors=existing.length?existing:[{x:0,z:-Math.min(6,length/2-1.5)}];
  const minMonster=2*DUMMY_RADIUS+0.05,minPlayer=DUMMY_RADIUS+playerRadius+0.05;
  for(let attempt=0;attempt<48;attempt++){
    const anchor=anchors[(index+attempt)%anchors.length];
    const angle=((index*17+attempt*41)%360)*Math.PI/180;
    const radius=2.2+((index*3+attempt)%7)*0.55;
    const candidate=clampSpawn({x:anchor.x+Math.cos(angle)*radius,z:anchor.z+Math.sin(angle)*radius},width,length);
    if(Math.hypot(candidate.x-player.x,candidate.z-player.z)<minPlayer)continue;
    if(existing.some(t=>Math.hypot(candidate.x-t.x,candidate.z-t.z)<minMonster))continue;
    return {id:`monster-${index+1}`,label:`蜘蛛 ${index+1}`,...candidate};
  }
  const fallback=clampSpawn({x:player.x+((index%2)?1:-1)*(DUMMY_RADIUS+playerRadius+2.5),z:player.z-((index%3)+2)*1.4},width,length);
  return {id:`monster-${index+1}`,label:`蜘蛛 ${index+1}`,...fallback};
}

export function separateMonsters(targets:Point[],player:Point,playerRadius:number,width:number,length:number) {
  const ex=width/2-.155-DUMMY_RADIUS,ez=length/2-.155-DUMMY_RADIUS;
  // Alternate contacts and walls to resolve corners as well as a three-body contact.
  for(let pass=0;pass<40;pass++){
    for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++){
      const a=targets[i],b=targets[j],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),over=2*DUMMY_RADIUS-d;
      if(over>0){const nx=d>1e-9?dx/d:1,nz=d>1e-9?dz/d:0;a.x-=nx*over/2;a.z-=nz*over/2;b.x+=nx*over/2;b.z+=nz*over/2;}
    }
    for(const a of targets){
      const dx=a.x-player.x,dz=a.z-player.z,d=Math.hypot(dx,dz),r=DUMMY_RADIUS+playerRadius;
      if(d<r){
        const candidates:Point[]=[{x:player.x+(d>1e-9?dx/d:1)*r,z:player.z+(d>1e-9?dz/d:0)*r}];
        // If a wall blocks radial separation, use the nearest circle/wall intersection.
        for(const x of [-ex,ex]){const q=r*r-(x-player.x)**2;if(q>=0)for(const sign of [-1,1])candidates.push({x,z:player.z+sign*Math.sqrt(q)});}
        for(const z of [-ez,ez]){const q=r*r-(z-player.z)**2;if(q>=0)for(const sign of [-1,1])candidates.push({x:player.x+sign*Math.sqrt(q),z});}
        const feasible=candidates.filter(p=>Math.abs(p.x)<=ex+1e-9&&Math.abs(p.z)<=ez+1e-9).sort((b,c)=>Math.hypot(b.x-a.x,b.z-a.z)-Math.hypot(c.x-a.x,c.z-a.z));
        if(feasible[0])Object.assign(a,feasible[0]);
      }
      a.x=Math.max(-ex,Math.min(ex,a.x));a.z=Math.max(-ez,Math.min(ez,a.z));
    }
  }
}
