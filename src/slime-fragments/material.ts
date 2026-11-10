import type {MeshPhysicalNodeMaterial} from 'three/webgpu';
import {attribute,mix,materialColor,materialRoughness,materialTransmission,materialClearcoat,materialClearcoatRoughness,materialSpecularIntensity} from 'three/tsl';

export type FragmentSurfaceGroup={start:number;count:number;materialIndex:number};

/** Use the cutter's original labels. Depth is not a reliable classifier: a cut
 * face reaches the outer shell at its rim and still needs the interior material. */
export function fragmentInteriorMask(vertexCount:number,index:Uint32Array,groups:readonly FragmentSurfaceGroup[]){
 const mask=new Float32Array(vertexCount);
 for(const group of groups)if(group.materialIndex===1){
  for(let i=group.start;i<group.start+group.count;i++)mask[index[i]]=1;
 }
 return mask;
}

/** Cut gel retains the live body's colour, but does not behave like a polished
 * transparent outer shell. One shader/mask preserves the single draw per burst. */
export function configureFragmentMaterial(material:MeshPhysicalNodeMaterial){
 const inside=attribute('fragmentInterior','float');
 // Opaque gel returns more diffuse light than the transmissive shell. Compensate
 // its albedo to retain the body's hue under the game's bright linear lighting.
 material.colorNode=materialColor.rgb.mul(mix(1,.45,inside));
 material.roughnessNode=mix(materialRoughness,.38,inside);
 material.transmissionNode=mix(materialTransmission,.06,inside);
 material.clearcoatNode=mix(materialClearcoat,.12,inside);
 material.clearcoatRoughnessNode=mix(materialClearcoatRoughness,.36,inside);
 material.specularIntensityNode=mix(materialSpecularIntensity,.4,inside);
}
