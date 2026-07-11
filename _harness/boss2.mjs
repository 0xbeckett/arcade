import { readFileSync } from 'node:fs';
const COLS=20,ROWS=18;
const P='/home/beckett/Projects/arcade/.beckett/worktrees/8753e0c7-4bdb-4a54-8b86-c04c41deb90e/public/games/shmup.js';
function mk(){const g=Array.from({length:ROWS},()=>new Array(COLS).fill(' '));const inb=(x,y)=>x>=0&&x<COLS&&y>=0&&y<ROWS;const put=(x,y,c)=>{x=x|0;y=y|0;if(inb(x,y))g[y][x]=c&&c.length?c[0]:' ';};return{cols:COLS,rows:ROWS,clear(){for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)g[y][x]=' ';},set(x,y,c){put(x,y,c);},get(x,y){return inb(x|0,y|0)?g[y|0][x|0]:' ';},text(x,y,s){s=String(s);for(let k=0;k<s.length;k++)put(x+k,y,s[k]);},textCentered(y,s){s=String(s);this.text(Math.round((COLS-s.length)/2),y,s);},fillRect(x,y,w,h,c){for(let j=0;j<h;j++)for(let i=0;i<w;i++)put(x+i,y+j,c);},rect(){},hline(x,y,w,c){for(let i=0;i<w;i++)put(x+i,y,c);},vline(x,y,h,c){for(let j=0;j<h;j++)put(x,y+j,c);},rows(){return g.map(r=>r.join(''));}};}
const held=Object.create(null);const input={isDown:b=>!!held[b],justPressed:()=>false,justReleased:()=>false};
let reg=null;globalThis.window={Arcade:{registerGame(g){reg=g;},submitScore(){return Promise.resolve([]);},getLeaderboard(){return Promise.resolve([]);},getBestScore(){return 0;},setBestScore(i,s){return s;},gameOver(){},Color:{LIGHTEST:'lightest',LIGHT:'light',DARK:'dark',DARKEST:'darkest'},version:'1.0.0'}};
(0,eval)(readFileSync(P,'utf8'));
const s=mk();const ctx={screen:s,input,arcade:window.Arcade,gameId:'shmup'};
reg.init(ctx);reg.onInput('a',true);held['a']=true;
function shipXY(){const r=s.rows();for(let y=0;y<ROWS;y++){const x=r[y].indexOf('↑');if(x>=0)return[x,y];}return[-1,-1];}
let bt=-1;
for(let i=0;i<40000;i++){const r=s.rows();const[sx,sy]=shipXY();held.left=held.right=held.up=held.down=false;if(sx>=0){let L=0,R=0,C=0;for(let y=Math.max(0,sy-5);y<sy;y++)for(let x=0;x<COLS;x++)if(r[y][x]==='↓'){if(x<sx)L+=6-(sy-y);if(x>sx)R+=6-(sy-y);if(Math.abs(x-sx)<=1)C+=6-(sy-y);}if(C>0||L!==R){if(L>R)held.right=true;else if(R>L)held.left=true;else held[sx<COLS/2?'right':'left']=true;}if(sy>13)held.up=true;}
if(r.some(x=>x.includes('GAME OVER')))reg.onInput('a',true);
reg.update(1000/60);reg.render(s);
if(bt<0&&s.rows().some(x=>x.includes('▓▓▓▓▓')))bt=i;
if(bt>=0&&i===bt+40){console.log('== BOSS SETTLED (40 frames after arrival) ==');console.log('+'+'-'.repeat(COLS)+'+');for(const row of s.rows())console.log('|'+row+'|');console.log('+'+'-'.repeat(COLS)+'+');break;}}
