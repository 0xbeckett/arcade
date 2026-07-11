'use strict';
const fs = require('fs'), path = require('path');
function makeScreen() {
  const cols=20, rows=18; let cells;
  const blank=()=>cells=Array.from({length:rows},()=>Array(cols).fill(' '));
  blank();
  const setc=(x,y,ch)=>{x|=0;y|=0;if(x<0||x>=cols||y<0||y>=rows)return;cells[y][x]=ch?ch[0]:' ';};
  return {cols,rows,clear(){blank();},set(x,y,ch){setc(x,y,ch);},get(x,y){return(cells[y]&&cells[y][x])||' ';},
    text(x,y,s){for(let i=0;i<s.length;i++)setc(x+i,y,s[i]);},
    textCentered(y,s){this.text(Math.floor((cols-s.length)/2),y,s);},
    fillRect(x,y,w,h,ch){for(let j=0;j<h;j++)for(let i=0;i<w;i++)setc(x+i,y+j,ch);},
    rect(x,y,w,h){for(let i=0;i<w;i++){setc(x+i,y,'-');setc(x+i,y+h-1,'-');}for(let j=0;j<h;j++){setc(x,y+j,'|');setc(x+w-1,y+j,'|');}setc(x,y,'+');setc(x+w-1,y,'+');setc(x,y+h-1,'+');setc(x+w-1,y+h-1,'+');},
    hline(){},vline(){},dump(){return cells.map(r=>'|'+r.join('')+'|').join('\n');}};
}
function makeInput(){const held={},prev={};return{latch(){for(const k of Object.keys(held))prev[k]=held[k];},press(b){held[b]=true;},release(b){held[b]=false;},isDown(b){return!!held[b];},justPressed(b){return!!held[b]&&!prev[b];},justReleased(b){return!held[b]&&!!prev[b];}};}
const Arcade={_game:null,registerGame(g){this._game=g;},submitScore(){return Promise.resolve([]);},getBestScore(){return 142;},setBestScore(id,s){return Math.max(142,s);}};
global.window={Arcade};
eval(fs.readFileSync(path.join(__dirname,'..','public','games','runner.js'),'utf8'));
const game=Arcade._game,screen=makeScreen(),input=makeInput();
game.init({screen,input,arcade:Arcade,gameId:'runner'});
const DT=1000/60;
function step(n=1){for(let i=0;i<n;i++){game.update(DT);input.latch();game.render(screen);}}
step(30);
console.log('=== READY ===');console.log(screen.dump());
input.press('a');step(1);input.release('a');
Math.random=()=>0.3;
step(150);
console.log('=== RUNNING ===');console.log(screen.dump());
input.press('a');step(12);
console.log('=== MID-JUMP (holding A) ===');console.log(screen.dump());
input.release('a');step(30);
input.press('down');step(4);
console.log('=== SLIDING ===');console.log(screen.dump());
input.release('down');
// run til death
for(let i=0;i<60*60;i++){step(1);if(screen.dump().includes('GAME OVER'))break;}
step(1);
console.log('=== GAME OVER ===');console.log(screen.dump());
