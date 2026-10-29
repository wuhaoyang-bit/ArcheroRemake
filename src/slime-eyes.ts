import * as T from 'three';
import {SLIME_EYES_DEFAULTS as defaults,type SlimeEyesSettings} from './slime-eyes-config.ts';
/** Opaque equirectangular albedo: the pupil is paint on the sphere, with no extra mesh. */
function paintPupil(texture:T.DataTexture,c:SlimeEyesSettings){const {width,height}=texture.image;const data=texture.image.data!;const r=Math.asin(c.slimePupilSize);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const u=(x+.5)/width,v=(y+.5)/height;const dx=Math.atan2(Math.sin((u-.25)*Math.PI*2-c.slimePupilX),Math.cos((u-.25)*Math.PI*2-c.slimePupilX)),dy=(v-.5)*Math.PI-c.slimePupilY,d=Math.hypot(dx/(r*c.slimePupilAspect),dy/r);const a=T.MathUtils.clamp((1-d)*r*height/Math.PI+.5,0,1),i=(y*width+x)*4;data[i]=Math.round(255*(1-a)+8*a);data[i+1]=Math.round(253*(1-a)+9*a);data[i+2]=Math.round(246*(1-a)+11*a);data[i+3]=255;}texture.needsUpdate=true;}
export function createSlimeEyes(face:T.Group){const tex=new T.DataTexture(new Uint8Array(512*256*4),512,256);tex.colorSpace=T.SRGBColorSpace;tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.generateMipmaps=true;
 const mat=new T.MeshPhysicalMaterial({map:tex,color:0xffffff,roughness:.22,clearcoat:1,clearcoatRoughness:.12});
 const eyes=[-1,1].map(side=>{const eye=new T.Group();eye.name=side<0?'EyeLeft':'EyeRight';const white=new T.Mesh(new T.SphereGeometry(1,48,32),mat);white.name='EyeWhiteWithPaintedPupil';eye.add(white);face.add(eye);return eye;});let key='',paintKey='';
 function update(c:SlimeEyesSettings){const next=Object.keys(defaults).map(k=>c[k as keyof SlimeEyesSettings]).join('/');if(next===key)return false;key=next;face.visible=!!c.slimeEyesEnabled;const pk=[c.slimePupilSize,c.slimePupilAspect,c.slimePupilX,c.slimePupilY].join('/');if(pk!==paintKey){paintKey=pk;paintPupil(tex,c);}
 eyes.forEach((eye,i)=>{eye.position.set(c.slimeEyeX+(i===0?-.5:.5)*c.slimeEyeSpacing,c.slimeEyeY,c.slimeEyeZ);eye.scale.set(c.slimeEyeSize*c.slimeEyeWidth,c.slimeEyeSize*c.slimeEyeHeight,c.slimeEyeSize*c.slimeEyeDepth);const material=(eye.children[0] as T.Mesh).material as T.MeshPhysicalMaterial;material.roughness=c.slimeEyeRoughness;material.clearcoatRoughness=c.slimeEyeGloss;});return true;}
 update(defaults);return update;
}
