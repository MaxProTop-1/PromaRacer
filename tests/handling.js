// node tests/handling.js — как машина реагирует на уровни руля Cardputer на скорости
const fs=require("fs"),vm=require("vm"),path=require("path");
const ctx={console,Math,Float64Array,Float32Array};vm.createContext(ctx);
for(const f of["cars","track","physics","ai"])vm.runInContext(fs.readFileSync(path.join(__dirname,"../js",f+".js"),"utf8"),ctx,{filename:f});
console.log(vm.runInContext(`(function(){
 buildTrack(TRACKS[0]); TRACK.K.fill(0);
 const o=['машина          скорость  руль  -> через 2с: боковое g, угол рыскания, макс скольжение зад.оси'];
 for(const id of CAR_ORDER){const D=CARS[id];
  for(const kmh of [100,200]) for(const st of [0.17,0.5,1.0]){
   const c=newVehicle(D);c.auto=true;c.s=10;c.vx=kmh/3.6;c.gear=D.gearMax-1;c.tempF=c.tempR=D.tireOpt;c.d=0;
   let maxA=0,maxAy=0;const h=1/240;
   for(let t=0;t<2;t+=h){physStep(c,{steer:st,gas:0.35,brake:0},h);maxA=Math.max(maxA,Math.abs(c.alphaR));maxAy=Math.max(maxAy,Math.abs(c.ay));c.d=Math.max(-5,Math.min(5,c.d));}
   o.push(D.name.padEnd(16)+String(kmh).padStart(5)+' км/ч '+st.toFixed(2).padStart(5)+'  -> '+(maxAy/GRAV).toFixed(2)+'g  psi '+(c.psi*57.3).toFixed(0).padStart(4)+'°  alphaR '+maxA.toFixed(2)+(maxA>0.25?'  СКОЛЬЖЕНИЕ':''));
  }}
 return o.join('\\n');})()`,ctx));
