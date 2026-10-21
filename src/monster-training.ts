/** Ground circles stay independent of visual squash. */
export const DUMMY_RADIUS = 1.3;
type Point = {x:number;z:number};
export function monsterTargets(width:number,length:number) {
  return [-1,1].map((side,i)=>({id:`monster-${i+1}`,label:`移动假人 ${i+1}`,x:side*Math.min(3,width/2-1.5),z:-Math.min(6,length/2-1.5)}));
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
