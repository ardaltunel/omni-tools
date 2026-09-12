const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function load() {
 const elements = new Map(); const timers = new Map(); let next = 0;
 const element = () => ({textContent:'',classList:{toggle(){},add(){}},setAttribute(){}});
 const context = vm.createContext({console,Math,document:{querySelectorAll:()=>[],getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);}},window:{addEventListener(){},setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);}}});
 vm.runInContext(fs.readFileSync(__dirname+'/script.js','utf8'),context);
 return {run:code=>vm.runInContext(code,context),timers};
}
test('restart cancels pending bot and rejects an already queued stale callback',()=>{
 const {run,timers}=load();run('resetAdvancedXox(); handleXoxPlayerMove(0)');
 const stale=[...timers.values()][0];assert.equal(timers.size,1);
 run('resetAdvancedXox(); handleXoxPlayerMove(4)');stale();
 assert.equal(run('xoxState.moves'),1);assert.equal(run('xoxState.board[4]'),'X');
 [...timers.values()][0]();assert.equal(run('xoxState.moves'),2);
 run('playXoxBotMove()');assert.equal(run('xoxState.moves'),2);
});
test('minimax cached scores agree with unpruned search across narrow windows',()=>{
 const {run}=load();
 run(`function reference(p,mark,depth){if(!depth)return evaluateXoxPosition(p);const scores=getXoxEmptyCells(p.board).map(i=>{const n=simulateXoxMove(p,i,mark);return n.winner?(n.winner==='O'?XOX_WIN_SCORE+depth:-XOX_WIN_SCORE-depth):reference(n,mark==='O'?'X':'O',depth-1)});return (mark==='O'?Math.max:Math.min)(...scores);}`);
 for(let i=0;i<12;i++) {
  const result=run(`(()=>{let p={board:Array(9).fill(''),queues:{X:[],O:[]}};let mark='X';for(let j=0;j<5;j++){const e=getXoxEmptyCells(p.board);p=simulateXoxMove(p,e[(${i}+j*3)%e.length],mark);if(p.winner)return true;mark=mark==='X'?'O':'X';}const cache=new Map();minimaxXox(p,mark,4,-10,10,cache);return minimaxXox(p,mark,4,-Infinity,Infinity,cache)===reference(p,mark,4);})()`);
  assert.equal(result,true);
 }
});
