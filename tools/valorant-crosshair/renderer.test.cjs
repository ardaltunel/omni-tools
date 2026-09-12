const {test}=require('node:test');const assert=require('node:assert/strict');const R=require('./renderer.js');
test('P settings are separate from global, ADS and sniper settings',()=>{const s=R.parse('0;s;1;P;c;5;0l;3;A;c;7;S;c;0');assert.equal(s.P.c,'5');assert.equal(s.P['0l'],'3');assert.equal(s.S.c,'0');});
test('zero lines and disabled layers produce no invented dot',()=>assert.deepEqual(R.geometry('0;P;h;0;0l;0;1b;0').rects,[]));
test('zero opacity keeps only outline bands, not filled black interiors',()=>{const {rects}=R.geometry('0;P;0b;0;1b;0;d;1;z;2;a;0;t;1;o;1');assert.equal(rects.length,4);assert.equal(rects.reduce((a,r)=>a+r.w*r.h,0),12);});
test('custom color applies only when selected',()=>{assert.equal(R.geometry('0;P;u;000000FF;h;0;1b;0').rects[0].color,'#FFFFFF');assert.equal(R.geometry('0;P;c;8;u;F23591FF;h;0;1b;0').rects[0].color,'#F23591');});
test('independent vertical lengths and limits are honored',()=>{const r=R.geometry('0;P;h;0;0l;4;0g;1;0v;0;1b;0').rects;assert.equal(r.length,2);assert.equal(r[0].w,4);});
test('malformed and unsafe input rejected',()=>{for(const code of ['', 'junk','0;P;0l','0;P;0l;Infinity','0;P;c;<svg>'])assert.throws(()=>R.svg(code));});

test('odd widths shift negative arms by one pixel',()=>{const r=R.geometry('0;P;h;0;0t;3;0l;4;0o;2;0f;0;1b;0').rects;assert.deepEqual(r.map(({x,y})=>[x,y]),[[2,-2],[-7,-2],[-2,2],[-2,-7]]);});
test('fire error spacing respects override',()=>{assert.equal(R.geometry('0;P;h;0;1b;0').rects[0].x,7);assert.equal(R.geometry('0;P;h;0;m;1;1b;0').rects[0].x,3);});
test('dot paints between inner and outer layers',()=>{const r=R.geometry('0;P;h;0;d;1;z;5;0f;0;1f;0').rects;assert.equal(r[4].w,5);assert.equal(r[5].x,10);});
