import {newGame, validate, reclaim, appendPair, append} from '../src/engine';
const g=newGame(); g.indicator={id:99,c:3,n:12}; g.turn=0; g.drawn=true;
const wild={id:100,c:3,n:13}, real={id:1,c:0,n:7}, replacement={id:2,c:0,n:7};
g.melds=[validate([real,wild],g.indicator,1,true)!];
g.players[0].opened='series'; g.players[0].hand=[replacement,{id:3,c:2,n:4},{id:4,c:1,n:9}];
const manual=structuredClone(g); reclaim(manual,2,0);
console.log('Engine pair reclaim succeeds:',manual.players[0].hand.some(t=>t.id===100));
try {appendPair(g,[2]);} catch(e) {console.log('UI pair route fails:',(e as Error).message)}
const run=newGame();run.indicator=g.indicator;run.turn=0;run.drawn=true;run.players[0].opened='series';run.players[0].hand=[wild,{id:44,c:2,n:1}];run.melds=[validate([4,5,6,7,8,9].map(n=>({id:n,c:0,n})),run.indicator)!];
append(run,100,0);console.log('Click path without drop end:',run.melds[0].values);
