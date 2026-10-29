import {MeshPhysicalNodeMaterial} from 'three/webgpu';
import {mix,normalViewGeometry,smoothstep,transformNormalToView,vec3} from 'three/tsl';

/** Shared with the existing merged puddle: linear colour, scene lighting, one tone-map pass. */
export function createSlimeLiquidMaterial(){
 return new MeshPhysicalNodeMaterial({color:0xffffff,roughness:.12,metalness:0,ior:1.45,alphaToCoverage:true});
}

/** The same rim treatment already used by CurveFluid to avoid dark, steep gel edges. */
export function slimeLiquidRimNormal(){
 const up=transformNormalToView(vec3(0,1,0)).normalize();
 const rim=smoothstep(.35,.95,normalViewGeometry.dot(up)).oneMinus();
 return mix(normalViewGeometry,up,rim.mul(.7)).normalize();
}
