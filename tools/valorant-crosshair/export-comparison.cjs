const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'script.js'),'utf8').split('const valorantGrid')[0];
const ctx={};vm.createContext(ctx);vm.runInContext(src+';this.items=valorantCrosshairs;',ctx);
const renderer=require('./renderer.js');
fs.writeFileSync(path.join(__dirname,'comparison-data.json'),JSON.stringify(ctx.items.map(item=>({...item,...renderer.geometry(item.code)}))));
