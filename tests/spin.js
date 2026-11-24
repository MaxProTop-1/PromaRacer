// node tests/spin.js [assist 0|1] — устойчивость при "человеческом" вождении: газ/тормоз в повороте, слалом
const fs=require("fs"),vm=require("vm"),path=require("path");
const ctx={console,Math,Float64Array,Float32Array};vm.createContext(ctx);
for(const f of["cars","track","physics","ai"])vm.runInContext(fs.readFileSync(path.join(__dirname,"../js",f+".js"),"utf8"),ctx,{filename:f});
const assist=process.argv[2]==="1";
console.log(vm.runInContext(`(function(assist){
 buildTrack(TRACKS[0]); TRACK.K.fill(0);
 const sc={
  'A газ в повороте 100км/ч':{v:100,T:4,f:t=>({steer:0.6,gas:1,brake:0})},
  'B газ после сброса 120':{v:120,T:4,f:t=>({steer:0.5,gas:t<1?0.2:1,brake:0})},
  'C тормоз в повороте 150':{v:150,T:4,f:t=>({steer:0.7,gas:0,brake:t<1?0:1})},
  'D слалом 100 км/ч':{v:100,T:5,f:t=>({steer:(Math.floor(t/0.8)%2?-1:1)*0.8,gas:0.6,brake:0})},
  'E резкий руль 200 км/ч':{v:200,T:4,f:t=>({steer:t<0.5?0:(t<1.5?1:-1),gas:0.4,brake:0})},
  'F 1 передача газ+руль':{v:40,T:4,f:t=>({steer:0.7,gas:1,brake:0}),g:1}
 };
 const o=['сценарий                 '+CAR_ORDER.map(i=>i.padEnd(6)).join('')+'  (макс. угол увода задней оси, рад; >0.35 = занос, >0.6 = разворот)'];
 for(const k in sc){const S=sc[k];let row=k.padEnd(25);
  for(const id of CAR_ORDER){const D=CARS[id];const c=newVehicle(D);c.auto=true;c.assist=assist;c.s=10;c.vx=S.v/3.6;
   c.gear=S.g||Math.max(1,Math.min(D.gearMax,Math.round(S.v/(D.redline*Math.PI/30*D.wheelR/(D.ratios[0]*D.final)*3.6/1.0)))) ;
   c.tempF=c.tempR=D.tireOpt;let mx=0;const h=1/240;
   for(let t=0;t<S.T;t+=h){const i=S.f(t);physStep(c,i,h);c.d=Math.max(-8,Math.min(8,c.d));mx=Math.max(mx,Math.abs(c.alphaR));}
   row+=mx.toFixed(2).padEnd(6);}
  o.push(row);}
 return o.join('\\n');})(${assist})`,ctx));
