import {createSlimeEyes} from './slime-eyes.ts';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Static model study. Local origin sits at the feet; no gameplay or animation. */
export function createYellowSlimeModel(){
 const root=new T.Group();root.name='YellowSlimeModel';
 const material=new T.MeshPhysicalMaterial({color:0xffdd32,roughness:.19,metalness:0,transmission:.65,thickness:1.8,ior:1.36,attenuationColor:0xffcc20,attenuationDistance:2.6,clearcoat:.8,clearcoatRoughness:.15});
 const body=new T.Mesh(new RoundedBoxGeometry(2,2,2,6,.24),material);body.position.y=1;body.castShadow=true;body.receiveShadow=true;root.add(body);
 const face=new T.Group();face.name='Face';root.add(face);
 const updateEyes=createSlimeEyes(face);
 return {root,body,material,face,updateEyes};
}
