"""Compare code geometry against reference pixels, without modifying images.
Run node export-comparison.cjs, then python tools/valorant-crosshair/compare.py.
Pillow and NumPy required. Tiny alpha <=16 reference artifacts are excluded.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image
base=Path(__file__).parent
items=json.loads((base/'comparison-data.json').read_text())
results=[]
for item in items:
 ref=np.array(Image.open(Path(item['image'])).convert('RGBA'),dtype=float)/255
 h,w=ref.shape[:2]; actual=np.zeros_like(ref)
 for r in item['rects']:
  x=int(w/2+r['x']);y=int(h/2+r['y']); rw=int(r['w']);rh=int(r['h']);a=r['a']
  c=np.array([int(r['color'][i:i+2],16)/255 for i in (1,3,5)])
  area=actual[max(0,y):min(h,y+rh),max(0,x):min(w,x+rw)]
  old=area[:,:,3].copy();new=a+old*(1-a)
  area[:,:,:3]=np.divide(c*a+area[:,:,:3]*old[:,:,None]*(1-a),new[:,:,None],out=np.zeros_like(area[:,:,:3]),where=new[:,:,None]>0)
  area[:,:,3]=new
 mask=(ref[:,:,3]>16/255)|(actual[:,:,3]>16/255)
 # Compare premultiplied channels so invisible RGB is immaterial.
 ref[:,:,:3]*=ref[:,:,3,None];actual[:,:,:3]*=actual[:,:,3,None]
 different=(np.max(np.abs(ref-actual),axis=2)>2/255)&mask
 results.append({'name':item['name'],'reference':item['image'],'comparedPixels':int(mask.sum()),'differentPixels':int(different.sum()),'exact':not different.any()})
(base/'comparison-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
for r in results: print(r['name'],r['differentPixels'],'/',r['comparedPixels'])
