'use strict';
const fs = require('fs');
const path = require('path');
function makeScreen() {
  const cols = 20, rows = 18;
  let cells;
  const blank = () => cells = Array.from({ length: rows }, () => Array(cols).fill(' '));
  blank();
  const setc = (x, y, ch) => { x|=0;y|=0; if(x<0||x>=cols||y<0||y>=rows)return; cells[y][x]=ch?ch[0]:' '; };
  return { cols, rows,
    clear(){blank();}, set(x,y,ch){setc(x,y,ch);}, get(x,y){return (cells[y]&&cells[y][x])||' ';},
    text(x,y,s){for(let i=0;i<s.length;i++)setc(x+i,y,s[i]);},
    textCentered(y,s){this.text(Math.floor((cols-s.length)/2),y,s);},
    fillRect(x,y,w,h,ch){for(let j=0;j<h;j++)for(let i=0;i<w;i++)setc(x+i,y+j,ch);},
    rect(){},hline(){},vline(){},
    dump(){return cells.map(r=>r.join('')).join('\n');} };
}
function makeInput() {
  const held={},prev={};
  return { latch(){for(const k of Object.keys(held))prev[k]=held[k];},
    press(b){held[b]=true;}, release(b){held[b]=false;},
    isDown(b){return !!held[b];}, justPressed(b){return !!held[b]&&!prev[b];},
    justReleased(b){return !held[b]&&!!prev[b];} };
}
const Arcade = { _game:null, registerGame(g){this._game=g;}, submitScore(){return Promise.resolve([]);},
  getBestScore(){return 0;}, setBestScore(id,s){return s;} };
global.window = { Arcade };
eval(fs.readFileSync(path.join(__dirname,'..','public','games','runner.js'),'utf8'));
const game = Arcade._game, screen = makeScreen(), input = makeInput();
game.init({screen,input,arcade:Arcade,gameId:'runner'});
let rv=[0];
Math.random = () => rv[0];
const DT=1000/60;
function step(){game.update(DT);input.latch();game.render(screen);}
input.press('a');step();input.release('a');step();
const frames=[];
let hold=0;
for(let i=0;i<60*60;i++){
  let ceilNear=false;
  for(let x=4;x<=9;x++) if(screen.get(x,6)==='█') ceilNear=true;
  let near=false;
  for(let x=5;x<=6;x++) if(screen.get(x,13)==='█'&&screen.get(x,5)!=='█') near=true;
  let act;
  if(ceilNear){hold=0;input.release('a');input.press('down');act='DOWN';}
  else{input.release('down'); if(near&&hold<=0)hold=22; if(hold>0){input.press('a');hold--;act='A';}else{input.release('a');act='-';}}
  step();
  frames.push('tick '+i+' act='+act+'\n'+screen.dump());
  if(screen.dump().includes('GAME OVER')){
    console.log('DIED at tick '+i);
    for(let k=Math.max(0,frames.length-16);k<frames.length;k++)console.log('---------\n'+frames[k]);
    process.exit(0);
  }
  const m=screen.dump().split('\n')[0].match(/(\d+)/);
  if(m&&parseInt(m[1],10)>95) rv=[0.7];
}
console.log('survived 60s');
