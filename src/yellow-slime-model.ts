import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Static model study. Local origin sits at the feet; no gameplay or animation. */
export function createYellowSlimeModel(){
 const root=new T.Group();root.name='YellowSlimeModel';
 const material=new T.MeshPhysicalMaterial({color:0xffdd32,roughness:.19,metalness:0,transmission:.65,thickness:1.8,ior:1.36,attenuationColor:0xffcc20,attenuationDistance:2.6,clearcoat:.8,clearcoatRoughness:.15});
 const body=new T.Mesh(new RoundedBoxGeometry(2,2,2,6,.24),material);body.position.y=1;body.castShadow=true;body.receiveShadow=true;root.add(body);
 const face=new T.Group();face.name='Face';root.add(face);
 const eyeMaterial=new T.MeshStandardMaterial({color:0x392611,roughness:.35});
 for(const x of [-.34,.34]){
  const eye=new T.Mesh(new T.SphereGeometry(.085,20,16),eyeMaterial);eye.position.set(x,1.15,.995);eye.scale.set(.83,1.15,.42);face.add(eye);
  const glint=new T.Mesh(new T.SphereGeometry(.019,12,8),new T.MeshBasicMaterial({color:0xfffbea}));glint.position.set(x-.018,1.18,1.029);face.add(glint);
 }
 return {root,body,material,face};
}
