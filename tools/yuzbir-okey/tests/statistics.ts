import {newGame,bot,bestMelds,total,type Game} from '../src/engine';
let seed=817261; Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const initial=[0,0,0,0];const sums=[0,0,0,0];
for(let n=0;n<1000;n++){const g=newGame();g.players.forEach((p,k)=>{const ms=bestMelds(p.hand,g.indicator);const s=ms.reduce((a,m)=>a+total(m),0);sums[k]+=s;if(s>=101||bestMelds(p.hand,g.indicator,true).length>=5)initial[k]++;});}
function step(g:Game){if(g.turn!==0){bot(g);return;} const rot=(k:number)=>(k+1)%4;g.players.unshift(g.players.pop()!);g.discards.unshift(g.discards.pop()!);g.penalties.unshift(g.penalties.pop()!);g.melds.forEach(m=>m.owner=rot(m.owner));g.turn=1;bot(g);g.turn=(g.turn+3)%4;g.players.push(g.players.shift()!);g.discards.push(g.discards.shift()!);g.penalties.push(g.penalties.shift()!);g.melds.forEach(m=>m.owner=(m.owner+3)%4);}
const opened=[0,0,0,0];let all=0,turns=0;
for(let n=0;n<200;n++){const g=newGame();let t=0;while(!g.over&&t++<300){step(g);const ids=[g.indicator,...g.deck,...g.players.flatMap(p=>p.hand),...g.discards.flat(),...g.melds.flatMap(m=>m.tiles)].map(t=>t.id);if(ids.length!==106||new Set(ids).size!==106)throw Error('tile integrity');}if(!g.over)throw Error('stalled');turns+=t;g.players.forEach((p,k)=>{if(p.opened)opened[k]++});if(g.players.every(p=>p.opened))all++;}
console.log(JSON.stringify({seed:817261,initialGames:1000,initialOpenCounts:initial,meanInitialSeries:sums.map(s=>s/1000),playedGames:200,opened,allOpened:all,meanTurns:turns/200,comparison:'seat0 immediate-open bot proxy, not a human player'},null,2));
