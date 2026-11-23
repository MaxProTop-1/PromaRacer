// node tests/accel.js — разгон и торможение по прямой (кривизна трассы обнуляется)
const fs=require("fs"),vm=require("vm"),path=require("path");
const ctx={console,Math,Float64Array,Float32Array};vm.createContext(ctx);
for(const f of["cars","track","physics","ai"])vm.runInContext(fs.readFileSync(path.join(__dirname,"../js",f+".js"),"utf8"),ctx,{filename:f});
console.log(vm.runInContext(`(function(){
 buildTrack(TRACKS[0]); TRACK.K.fill(0); TRACK.minR=1e9;
 const o=['машина            0-100  0-200  0-300 | 100-0 м   200-0 м | vmax'];
 for(const id of CAR_ORDER){const D=CARS[id];
  const c=newVehicle(D);c.auto=true;c.s=10;c.tempF=c.tempR=D.tireOpt;let t=0,t100=0,t200=0,t300=0;const h=1/240;
  while(t<60){physStep(c,{steer:0,gas:1,brake:0},h);t+=h;const v=c.vx*3.6;if(!t100&&v>=100)t100=t;if(!t200&&v>=200)t200=t;if(!t300&&v>=300)t300=t;c.d=0;c.psi=0;}
  const vmax=c.vx*3.6;
  const brk=(v0)=>{const k=newVehicle(D);k.auto=true;k.s=10;k.vx=v0/3.6;k.gear=D.gearMax;k.tempF=k.tempR=D.tireOpt;const s0=k.s;let tt=0;while(k.vx>0.5&&tt<30){physStep(k,{steer:0,gas:0,brake:1},h);tt+=h;k.d=0;k.psi=0;}return k.s-s0;};
  o.push(D.name.padEnd(18)+(t100?t100.toFixed(1):'-').padStart(5)+(t200?t200.toFixed(1):'-').padStart(7)+(t300?t300.toFixed(1):'-').padStart(7)+' | '+brk(100).toFixed(0).padStart(5)+brk(200).toFixed(0).padStart(10)+' | '+vmax.toFixed(0));}
 return o.join('\\n');})()`,ctx));
