// Temporary standalone UI fixture: its storage is in memory, never the player's save.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = source.indexOf('<section id="blackjack"');
const end = source.indexOf('<section id=', start + 1);
const panel = source.slice(start, end).replace('tool-panel blackjack-panel', 'tool-panel blackjack-panel active');
const touchCss = fs.readFileSync(path.join(__dirname, 'blackjack.css'), 'utf8').split('@media(hover:none) and (pointer:coarse) {')[1]?.trim().replace(/\}\s*$/, '') || '';
const setup = `
if(new URLSearchParams(location.search).has('touch')) { const style=document.createElement('style'); style.textContent=${JSON.stringify(touchCss)}; document.head.append(style); }
const e = window.OmniBlackjackEngine;
const scenario = new URLSearchParams(location.search).get('case') || 'split';
const card = (rank, i) => ({...e.createDeck().find(c => c.rank === rank), id:'fixture-'+i});
let state = e.createState({balance:20000});
e.setBet(state,200); e.beginRound(state);
state.phase=e.PHASES.PLAYER_TURN;
state.dealerHand=[card('10',90),card('7',91)];
state.playerHands[0].cards=[card('8',1),card('8',2)];
if(scenario==='many') state.playerHands[0].cards=['2','2','2','2','2','2','2'].map(card);
if(scenario==='insurance') { state.dealerHand[0]=card('A',90); state.phase=e.PHASES.INSURANCE; }
if(scenario==='splitmany') { state.playerHands[0].isSplit=true; state.playerHands[0].cards=['2','2','2','2','2','2'].map(card); state.playerHands.push({...state.playerHands[0],id:'hand-2',cards:['3','3','3','3'].map((r,i)=>card(r,i+20))}); }
if(scenario==='betting') state=e.createState();
let saved=JSON.stringify({game:e.serializeState(state),soundEnabled:false});
Object.defineProperty(window,'localStorage',{value:{getItem:()=>saved,setItem:(k,v)=>saved=v}});
`;
fs.writeFileSync(path.join(root, '.blackjack-audit.html'), `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="tools/blackjack/blackjack.css"><style>body{display:block;padding:12px}#blackjack{max-width:1000px;margin:auto}</style>${panel}<script src="tools/blackjack/engine.js"></script><script>${setup}</script><script src="tools/blackjack/app.js"></script></html>`);
console.log('Created .blackjack-audit.html; remove after the UI audit.');
