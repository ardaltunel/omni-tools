/* Static primary crosshair renderer. Coordinates are game pixels, not CSS guesses. */
(function(root, factory) {
 const api = factory();
 if (typeof module === 'object' && module.exports) module.exports = api;
 else root.ValorantCrosshairRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
 'use strict';
 function parse(code) {
  const tokens=String(code).trim().split(';').map(t=>t.trim());
  if(tokens[0]!=='0' || tokens.length>512) throw new Error('Geçerli bir Valorant nişangâh kodu gir.');
  const sections={G:{},P:{},A:{},S:{}}; let section='G';
  for(let i=1;i<tokens.length;) {
   if(['P','A','S'].includes(tokens[i])) {section=tokens[i++];continue;}
   if(!tokens[i] && i===tokens.length-1) break;
   const key=tokens[i++], value=tokens[i++];
   if(!key || value===undefined || !value || !/^[a-z0-9]+$/i.test(key) || !/^[a-z0-9.+-]+$/i.test(value)) throw new Error('Nişangâh kodu eksik veya geçersiz.');
   sections[section][key]=value;
  }
  if(!tokens.includes('P')) throw new Error('Kodda ana nişangâh (P) bölümü bulunamadı.');
  return sections;
 }
 function geometry(code) {
  const s=parse(code).P;
  const num=(k,d,min,max)=>{const n=s[k]===undefined?d:Number(s[k]);if(!Number.isFinite(n))throw new Error('Geçersiz nişangâh değeri.');return Math.max(min,Math.min(max,n));};
  const colors=['#FFFFFF','#00FF00','#7FFF00','#DFFF00','#FFFF00','#00FFFF','#FF00FF','#FF0000'];
  const c=num('c',0,0,8); let color=colors[c]||'#FFFFFF';
  if(c===8 && /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s.u||'')) color='#'+s.u.slice(0,6);
  const outline=s.h!=='0', border=num('t',1,1,6), opacity=num('o',.5,0,1);
  const rects=[];
  function add(x,y,w,h,a) {
   if(w<=0||h<=0)return;
   if(a>0)rects.push({x,y,w,h,color,a});
   if(outline && opacity>0) {
    for(const [bx,by,bw,bh] of [[x-border,y-border,w+2*border,border],[x-border,y+h,w+2*border,border],[x-border,y,border,h],[x+w,y,border,h]])
     rects.push({x:bx,y:by,w:bw,h:bh,color:'#000000',a:opacity});
   }
  }
  function dot() {
   if(s.d==='1') {const size=num('z',2,1,6);add(-Math.ceil(size/2),-Math.ceil(size/2),size,size,num('a',1,0,1));}
  }
  for(const layer of ['0','1']) {
   if(layer==='1')dot(); // The outer layer paints over the center dot.
   if(s[layer+'b']==='0')continue;
   const length=num(layer+'l',layer==='0'?6:2,0,layer==='0'?20:10), vertical=s[layer+'g']==='1'?num(layer+'v',layer==='0'?6:2,0,20):length;
   const t=num(layer+'t',2,0,10), offset=num(layer+'o',layer==='0'?3:10,0,layer==='0'?20:40)+(s.m!=='1' && s[layer+'f']!=='0'?4:0), a=num(layer+'a',layer==='0'?.8:.35,0,1);
   const half=Math.ceil(t/2), parity=t%2;
   // Odd widths extend left/up by one pixel, matching the preview raster grid.
   add(offset,-half,length,t,a);
   add(-offset-length-parity,-half,length,t,a);
   add(-half,offset,t,vertical,a);
   add(-half,-offset-vertical-parity,t,vertical,a);
  }
  return {rects,settings:s};
 }
 function svg(code) {
  const {rects}=geometry(code);
  return '<svg class="vc-code-preview" xmlns="http://www.w3.org/2000/svg" viewBox="-64 -64 128 128" role="img" aria-label="Koddan çizilen ana nişangâh" shape-rendering="crispEdges">'+rects.map(r=>`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.color}" fill-opacity="${r.a}"/>`).join('')+'</svg>';
 }
 return {parse,geometry,svg};
});
