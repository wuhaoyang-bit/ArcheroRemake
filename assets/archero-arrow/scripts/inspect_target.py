exec(open(__file__.replace('inspect_target.py','audit.py')).read().split('for o in e.objects:')[0])
ids=set()
for gid in [38305,149662]:
 g=t(gid);tid=next(c['component']['m_PathID'] for c in g['m_Component'] if obs[c['component']['m_PathID']].type.name=='Transform');tr=t(tid);root=t(tr['m_Father']['m_PathID'])['m_GameObject']['m_PathID'];ids.add(root)
 print('ROOT',root,json.dumps(t(root)));print('CHILD',json.dumps(g));print('TRANSFORM',json.dumps(tr))
 for c in g['m_Component']:
  i=c['component']['m_PathID']
  if obs[i].type.name=='MeshRenderer':
   d=t(i);print('RENDERER',json.dumps(d));
   for p in d['m_Materials']:print('MATERIAL',p,json.dumps(t(p['m_PathID'])))
env=UnityPy.load(str(D/'globalgamemanagers'))
for o in env.objects:
 if o.type.name=='ResourceManager':
  for k,v in o.read_typetree()['m_Container']:
   if v['m_PathID'] in ids:print('RESOURCE',k,v)
