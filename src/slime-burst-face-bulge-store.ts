import {
  cloneFaceBulgeDoc,
  emptyFaceBulgeDoc,
  type FaceBulgeDocument,
  type FaceBulgeEntry,
  type FaceBulgeParams,
  DEFAULT_FACE_BULGE,
} from './slime-burst-face-bulge.ts';

const FILE_URL=`${import.meta.env.BASE_URL}slime-burst-face-bulge.json`;
const SAVE_URL=`${import.meta.env.BASE_URL}__save-face-bulge`;

function sanitizeParams(raw:Partial<FaceBulgeParams>|undefined):FaceBulgeParams{
  const p={...DEFAULT_FACE_BULGE,...(raw??{})};
  return {
    enabled:!!p.enabled,
    bulge:Math.min(1,Math.max(0,Number(p.bulge)||0)),
    fill:Math.min(1,Math.max(0,Number(p.fill)||0)),
    rings:Math.min(16,Math.max(2,Math.round(Number(p.rings)||6))),
  };
}

function sanitizeEntry(raw:Partial<FaceBulgeEntry>):FaceBulgeEntry|null{
  if(!raw||typeof raw.id!=='string')return null;
  const normal=raw.normal;
  const point=raw.point;
  if(!Array.isArray(normal)||normal.length!==3||!Array.isArray(point)||point.length!==3)return null;
  return {
    id:raw.id,
    chunkIndex:Math.max(0,Math.floor(Number(raw.chunkIndex)||0)),
    normal:[Number(normal[0])||0,Number(normal[1])||0,Number(normal[2])||0],
    point:[Number(point[0])||0,Number(point[1])||0,Number(point[2])||0],
    params:sanitizeParams(raw.params),
  };
}

export function parseFaceBulgeDocument(raw:unknown):FaceBulgeDocument{
  const doc=(raw&&typeof raw==='object'?raw:{}) as Partial<FaceBulgeDocument>;
  const cutMode=doc.cutMode==='plane'?'plane':'voronoi';
  const cutSeed=Math.max(1,Math.floor(Number(doc.cutSeed)||1));
  const faces=(Array.isArray(doc.faces)?doc.faces:[]).map(sanitizeEntry).filter((x):x is FaceBulgeEntry=>!!x);
  return {version:1,cutMode,cutSeed,faces};
}

export async function loadFaceBulgeDocument():Promise<FaceBulgeDocument>{
  try{
    const response=await fetch(FILE_URL,{cache:'no-store'});
    if(!response.ok)return emptyFaceBulgeDoc();
    return parseFaceBulgeDocument(await response.json());
  }catch{
    return emptyFaceBulgeDoc();
  }
}

export async function saveFaceBulgeDocument(doc:FaceBulgeDocument):Promise<void>{
  const body=cloneFaceBulgeDoc(parseFaceBulgeDocument(doc));
  const response=await fetch(SAVE_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body),
  });
  const result=await response.json().catch(()=>null) as {ok?:boolean;error?:string}|null;
  if(!response.ok||!result?.ok)throw new Error(result?.error||'保存切面鼓面参数失败');
}

/** Upsert one face entry by id. */
export function upsertFaceEntry(doc:FaceBulgeDocument,entry:FaceBulgeEntry):FaceBulgeDocument{
  const next=cloneFaceBulgeDoc(doc);
  const i=next.faces.findIndex(f=>f.id===entry.id);
  if(i>=0)next.faces[i]=entry;
  else next.faces.push(entry);
  return next;
}
