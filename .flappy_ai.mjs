import fs from 'node:fs';

let captured = null;
const bests = {};
const submitted = [];
globalThis.window = { Arcade: { registerGame: (g) => { captured = g; } } };

// recording 20x18 screen the autopilot can "see"
const COLS=20, ROWS=18;
let grid;
function blank(fill){ grid = Array.from({length:ROWS},()=>Array(COLS).fill(fill||' ')); }
function put(x,y,ch){ x=Math.round(x); y=Math.round(y); if(x>=0&&x<COLS&&y>=0&&y<ROWS) grid[y][x]=ch; }
const screen = {
  clear: (sh)=>blank(' '),
  set: (x,y,ch)=>put(x,y,ch),
  text: (x,y,str)=>{ str=String(str); for(let i=0;i<str.length;i++) put(x+i,y,str[i]); },
  textCentered: (y,str)=>{ str=String(str); const x=Math.floor((COLS-str.length)/2); screen.text(x,y,str); },
  fillRect: (x,y,w,h,ch)=>{ for(let j=0;j<h;j++)for(let i=0;i<w;i++) put(x+i,y+j,ch); },
  rect: ()=>{},
  hline: (x,y,len,ch)=>{ for(let i=0;i<len;i++) put(x+i,y,ch); },
  vline: (x,y,len,ch)=>{ for(let i=0;i<len;i++) put(x,y+i,ch); },
};

const pressed=new Set(); const down=new Set();
const input={ isDown:b=>down.has(b), justPressed:b=>pressed.has(b), justReleased:()=>false };
function press(b){ pressed.add(b); down.add(b); }
function frameClear(){ pressed.clear(); down.clear(); }
const arcade={ getBestScore:id=>bests[id]||0, setBestScore:(id,s)=>{bests[id]=Math.max(bests[id]||0,s);return bests[id];}, submitScore:(id,s)=>{submitted.push([id,s]);return Promise.resolve();} };

new Function(fs.readFileSync('public/games/flappy.js','utf8'))();
const g=captured; g.init({arcade,input});
const DT=1000/60;
function step(){ g.update(DT); g.render(screen); }

const BX=5, SKY=1, GROUND=16;
const isWall = ch => ch==='█' || ch==='▓' || ch==='▒';
function birdRow(){ for(let y=0;y<GROUND;y++) if(grid[y][BX]==='●') return y; return -1; }
function nextWallCol(){
  for(let x=BX;x<COLS;x++){
    let dark=0; for(let y=SKY;y<GROUND;y++) if(isWall(grid[y][x])) dark++;
    if(dark>=3) return x;
  }
  return -1;
}
function gapCenter(col){
  // longest run of open rows in [SKY,GROUND)
  let bestC=(SKY+GROUND)/2, bestLen=0, runStart=-1;
  for(let y=SKY;y<=GROUND;y++){
    const open = y<GROUND && !isWall(grid[y][col]);
    if(open){ if(runStart<0) runStart=y; }
    else { if(runStart>=0){ const len=y-runStart; if(len>bestLen){bestLen=len; bestC=(runStart+y-1)/2;} runStart=-1; } }
  }
  return bestC;
}

// start
step(); press('a'); step(); frameClear();

let framesSinceFlap=99, maxScore=0, gamesPlayed=0, subBefore=0;
for(let i=0;i<20000;i++){
  const br=birdRow();
  let target;
  const wc=nextWallCol();
  if(wc>=0) target=gapCenter(wc); else target=(SKY+GROUND)/2;
  // aim slightly above centre; flap if at/below target and not just flapped
  if(br>=0 && br>target-0.3 && framesSinceFlap>=3){ press('a'); framesSinceFlap=0; }
  else framesSinceFlap++;
  step();
  if(submitted.length>subBefore){
    subBefore=submitted.length; gamesPlayed++;
    maxScore=Math.max(maxScore, submitted[submitted.length-1][1]);
    frameClear();
    for(let k=0;k<16;k++) step();          // wait out dead grace
    press('a'); step(); frameClear();      // restart
    framesSinceFlap=99;
  }
  frameClear();
}
console.log('games played:', gamesPlayed);
console.log('best score by screen-reading AI:', maxScore);
console.log('sample scores:', submitted.slice(0,12).map(s=>s[1]).join(','));
console.log(maxScore>=5 ? 'PLAYABLE ✓ (competent play clears multiple gaps)'
                        : 'CHECK: AI could not clear gaps — tuning may be off');
