import * as THREE from 'three/webgpu';
import { trainingCourse, CHECKPOINT_RADIUS } from './training.ts';

/** Procedural laughing yellow dragon stand-in; no external assets or network dependency. */
function laughingDragon() {
  const group = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({color: 0xffcd27, roughness: .8});
  const cream = new THREE.MeshStandardMaterial({color: 0xfff1a4, roughness: .9});
  const dark = new THREE.MeshStandardMaterial({color: 0x542d20, roughness: .9});
  const pink = new THREE.MeshStandardMaterial({color: 0xff7c82, roughness: .8});
  const white = new THREE.MeshStandardMaterial({color: 0xfffced});
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const ball = (material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(sphere, material); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz);
    mesh.castShadow = true; group.add(mesh); return mesh;
  };
  ball(yellow,0,.82,0,.82,.86,.65);
  ball(cream,0,.85,.53,.55,.58,.15);
  ball(yellow,0,1.91,.04,.9,.78,.69);
  ball(yellow,-.5,.17,.3,.39,.19,.47); ball(yellow,.5,.17,.3,.39,.19,.47);
  ball(yellow,-.9,1.12,.05,.27,.48,.27).rotation.z=-.9;
  ball(yellow,.9,1.12,.05,.27,.48,.27).rotation.z=.9;
  ball(yellow,0,.36,-.68,.32,.28,.67);
  // Open laughing mouth, tongue, upper tooth, closed happy eyes.
  ball(dark,0,1.73,.655,.48,.38,.11);
  ball(pink,0,1.51,.735,.28,.12,.055);
  ball(white,0,1.96,.743,.28,.065,.04);
  for (const side of [-1,1]) {
    const eye = new THREE.Mesh(new THREE.TorusGeometry(.16,.043,6,16,Math.PI),dark);
    eye.position.set(side*.38,2.13,.68); group.add(eye);
    ball(pink,side*.64,1.89,.57,.14,.075,.04);
    ball(yellow,side*.43,2.58,-.02,.18,.28,.18);
  }
  return group;
}

export function buildTraining(width: number, length: number) {
  const group = new THREE.Group(), course = trainingCourse(width,length);
  const paint = new THREE.MeshBasicMaterial({color: 0xfff8ce, transparent:true, opacity:.85, depthWrite:false});
  const progressMaterials: THREE.MeshBasicMaterial[] = [];
  const halos: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  const flashes = course.checkpoints.map(() => 0);
  const completedColor = new THREE.Color(0x078c50), flashColor = new THREE.Color(0xbaffb0);
  let clock = 0;
  for (let i = 0; i < course.segments.length; i++) {
    const points = course.segments[i];
    const material = new THREE.MeshBasicMaterial({color: 0xfffdf0, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide});
    progressMaterials.push(material);
    // Flat ribbon on the ground, with constant width around the smooth bends.
    const vertices: number[] = [];
    for (let j = 0; j < points.length - 1; j++) {
      const a = points[j], b = points[j+1], d = Math.hypot(b.x-a.x,b.z-a.z);
      const nx = -(b.z-a.z)/d*.055, nz = (b.x-a.x)/d*.055;
      vertices.push(a.x+nx,.045,a.z+nz, a.x-nx,.045,a.z-nz, b.x+nx,.045,b.z+nz,
        a.x-nx,.045,a.z-nz, b.x-nx,.045,b.z-nz, b.x+nx,.045,b.z+nz);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    group.add(new THREE.Mesh(geometry,material));
    const checkpoint = course.checkpoints[i];
    if (checkpoint) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(CHECKPOINT_RADIUS-.085,CHECKPOINT_RADIUS,48),material);
      ring.rotation.x = -Math.PI/2; ring.position.set(checkpoint.x,.055,checkpoint.z);group.add(ring);
      const halo = new THREE.Mesh(new THREE.RingGeometry(CHECKPOINT_RADIUS+.06,CHECKPOINT_RADIUS+.12,48),
        new THREE.MeshBasicMaterial({color: 0xcaffac, transparent:true, opacity:0, depthWrite:false}));
      halo.rotation.x = -Math.PI/2; halo.position.set(checkpoint.x,.065,checkpoint.z);
      halo.visible = false; halos.push(halo);group.add(halo);
    }
  }
  let lastProgress = -1;
  group.userData.setProgress = (passed: number, dt = 0) => {
    const elapsed = Number.isFinite(dt) ? Math.max(0,dt) : 0;
    clock += elapsed;
    if (passed < lastProgress) { flashes.fill(0); clock = 0; }
    if (lastProgress >= 0 && passed > lastProgress) {
      for(let i=lastProgress;i<passed && i<flashes.length;i++) flashes[i] = .7;
    }
    lastProgress = passed;
    progressMaterials.forEach((material,i) => {
      const flash = (flashes[i] || 0)/.7;
      if (i < passed) material.color.copy(completedColor).lerp(flashColor,flash*flash);
      else material.color.setHex(0xfffdf0);
      material.opacity = .9;
    });
    halos.forEach((halo,i) => {
      const remaining = flashes[i];
      halo.visible = remaining > 0 || i === passed;
      if (remaining > 0) {
        const t = 1-remaining/.7;
        halo.scale.setScalar(1 + 1.2*(1-(1-t)**2));
        halo.material.opacity = .8*(1-t)**2;
        halo.material.color.copy(flashColor);
        flashes[i] = Math.max(0,remaining-elapsed);
      } else if (i === passed) {
        // Only the next checkpoint breathes; the actual white trigger ring stays fixed.
        const breath = .5+.5*Math.sin(clock*3);
        halo.scale.setScalar(1+.12*breath);
        halo.material.opacity = .12+.18*breath;
        halo.material.color.setHex(0xfffdf0);
      } else { halo.scale.setScalar(1); halo.material.opacity = 0; }
    });
  };
  for(const o of course.obstacles) {
    const dragon=laughingDragon(); dragon.position.set(o.x,0,o.z);group.add(dragon);
    const ring=new THREE.Mesh(new THREE.RingGeometry(o.radius-.04,o.radius,40),paint);
    ring.rotation.x=-Math.PI/2;ring.position.set(o.x,.04,o.z);group.add(ring);
  }
  const green=new THREE.MeshBasicMaterial({color:0x1c8b68});
  const tile=new THREE.PlaneGeometry(.55,.55);
  const cols=Math.floor((width-1)/.55);
  for(let row=0;row<2;row++)for(let x=0;x<cols;x++) {
    const m=new THREE.Mesh(tile,(row+x)%2?paint:green);
    m.rotation.x=-Math.PI/2;m.position.set((x-(cols-1)/2)*.55,.045,course.finishZ-row*.55);group.add(m);
  }
  const start=new THREE.Mesh(new THREE.RingGeometry(.8,.87,40),paint);
  start.rotation.x=-Math.PI/2;start.position.set(0,.04,course.startZ);group.add(start);
  return group;
}
