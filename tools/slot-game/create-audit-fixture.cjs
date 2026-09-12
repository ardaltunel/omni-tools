const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const start=source.indexOf('<section id="slot-game"');
const end=source.indexOf('<section id=',start+1);
const panel=source.slice(start,end).replace('tool-panel slot-game-panel','tool-panel slot-game-panel active');
const setup=`
const engine=window.OmniSlotGameEngine;
const scenario=new URLSearchParams(location.search).get('case');
let record=JSON.stringify({version:2,balance:10000,bet:100,soundEnabled:false});
Object.defineProperty(window,'localStorage',{value:{getItem:()=>record,setItem:(k,v)=>{record=v;document.getElementById('audit-save').textContent=v;}}});
if(scenario==='big'||scenario==='error') window.OmniSlotGameEngine={...engine,resolveCascades(...args){if(scenario==='error')throw Error('Intentional audit failure');const result=engine.resolveCascades(...args);return {...result,baseWin:5000,maxScatterCount:0,multiplierTotal:0,steps:[]};}};
`;
fs.writeFileSync(path.join(root,'.slot-audit.html'),`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="tools/slot-game/style.css"><style>body{display:block;padding:12px}#slot-game{max-width:1000px;margin:auto}#audit-save{display:block;font:12px monospace;overflow-wrap:anywhere}</style>${panel}<output id="audit-save"></output><script src="tools/slot-game/engine.js"></script><script>${setup}</script><script src="tools/slot-game/app.js"></script></html>`);
