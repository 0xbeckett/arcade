import fs from 'node:fs';

let captured = null;
const bests = {};
const submitted = [];
globalThis.window = { Arcade: { registerGame: (g) => { captured = g; } } };

const seen = new Set();
function mk(name, n) { return (...a) => { seen.add(name); if (a.length < n) throw new Error(name+' arity '+a.length); }; }
const screen = {
  clear: mk('clear',1), set: mk('set',4), text: mk('text',3),
  textCentered: mk('textCentered',2), fillRect: mk('fillRect',7),
  rect: mk('rect',5), hline: mk('hline',5), vline: mk('vline',5),
};

const down = new Set(); const pressed = new Set(); const released = new Set();
const input = {
  isDown: b => down.has(b),
  justPressed: b => pressed.has(b),
  justReleased: b => released.has(b),
};
function press(b){ pressed.add(b); down.add(b); }
function frameClear(){ pressed.clear(); released.clear(); down.clear(); }

const arcade = {
  getBestScore: id => bests[id] || 0,
  setBestScore: (id, s) => { bests[id] = Math.max(bests[id]||0, s); return bests[id]; },
  submitScore: (id, s) => { submitted.push([id, s]); return Promise.resolve(); },
};

const code = fs.readFileSync('public/games/flappy.js','utf8');
new Function(code)();
const g = captured;
if (!g) throw new Error('game did not register');
console.log('registered id/title:', g.id, g.title);
if (g.id !== 'flappy') throw new Error('wrong id');

g.init({ arcade, input });
const DT = 1000/60;
function step(){ g.update(DT); g.render(screen); frameClear(); }

// warm ready screen then start
step();
press('a'); step();

// Test A: no-flap -> falls and dies, submits exactly once with integer >=0
let frames=0, subBefore=submitted.length;
while (submitted.length===subBefore && frames<600){ step(); frames++; }
if (submitted.length!==subBefore+1) throw new Error('no-flap death did not submit once (got '+(submitted.length-subBefore)+')');
console.log('no-flap death after', frames, 'frames -> submit', JSON.stringify(submitted[submitted.length-1]));
if (submitted[submitted.length-1][0] !== 'flappy') throw new Error('submit wrong game');
if (!Number.isInteger(submitted[submitted.length-1][1])) throw new Error('score not integer');
if (submitted[submitted.length-1][1] !== 0) console.log('note: no-flap score =', submitted[submitted.length-1][1]);

// dead -> ensure early press is ignored (grace), late press restarts
step(); // deadTicks small
press('a'); step(); // likely ignored if within grace
for(let i=0;i<16;i++) step(); // pass grace
press('start'); step(); // restart via start

// Test B: cadence autopilot to see it CAN be played; handle restarts
let deaths=0, prevSub=submitted.length;
for(let i=0;i<4000;i++){
  if(i%8===0) press('a');
  step();
  if(submitted.length>prevSub){ deaths++; prevSub=submitted.length;
    for(let k=0;k<16;k++) step();
    press('a'); step();
  }
}
const scores = submitted.slice(1).map(s=>s[1]);
console.log('cadence autopilot deaths:', deaths, 'scores:', scores.join(','));
console.log('max cadence-bot score:', Math.max(0,...scores));

// Test C: destroy is safe
g.destroy();
console.log('screen methods exercised:', [...seen].sort().join(','));
console.log('best recorded:', bests.flappy);
console.log('ALL OK');
