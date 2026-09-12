const test = require('node:test');
const assert = require('node:assert/strict');
const e = require('./engine.js');
test('2000 seeded spins preserve money, grids, free spins and durable settlement', () => {
 let seed=20260912;
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const state=e.createState({balance:10000000,bet:100});
 let free=0,cascades=0;
 for(let i=0;i<2000;i++) {
  const before=state.balance, spins=state.freeSpins;
  const context=e.startRound(state);
  assert.ok(context);
  assert.equal(e.startRound(state),null);
  assert.equal(e.setBet(state,200),false);
  const cellFactory=context.mode==='free'?e.createFreeSpinCell:e.createRandomCell;
  const result=e.resolveCascades(e.createGrid(random,cellFactory),context.bet,random,{cellFactory});
  assert.ok(e.isValidGrid(result.finalGrid));
  assert.equal(new Set(result.finalGrid.flat().map(c=>c.uid)).size,30);
  const saved=structuredClone(state);
  const durable=e.settleRound(saved,result,context);
  const summary=e.settleRound(state,result,context);
  assert.deepEqual(summary,durable);
  assert.deepEqual(state,saved);
  assert.equal(state.balance,e.roundMoney(before-(context.mode==='paid'?context.bet:0)+summary.totalWin));
  assert.equal(state.freeSpins,spins-(context.mode==='free'?1:0)+summary.awardedFreeSpins);
  assert.equal(e.settleRound(state,result,context),null);
  if(context.mode==='free') free++;
  cascades+=result.steps.length;
 }
 console.log({spins:2000,free,cascades});
});
