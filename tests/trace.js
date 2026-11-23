const fs=require("fs"),vm=require("vm"),path=require("path");
const ctx={console,Math,Float64Array,Float32Array};vm.createContext(ctx);
for(const f of["cars","track","physics","ai"])vm.runInContext(fs.readFileSync(path.join(__dirname,"../js",f+".js"),"utf8"),ctx,{filename:f});
const id=process.argv[2]||"gtr", tmax=+(process.argv[3]||60), every=+(process.argv[4]||2);
console.log(vm.runInContext(`(function(id,tmax,every){
 buildTrack(TRACKS[0]);const D=CARS[id],c=newVehicle(D);c.auto=true;c.s=-5;const ai=newAI(D,0.95,0);const o=[];let t=0,n=0;const dt=1/120;
 o.push('t  s  v(km/h) vt d psi(deg) delta gas brk gear rpm alphaF alphaR kappa');
 while(t<tmax){const inp=aiDrive(c,ai,dt);physStep(c,inp,dt);t+=dt;n++;
  if(n%Math.round(every*120)==0){const idx=Math.floor(((c.s%TRACK.L)+TRACK.L)%TRACK.L/TRACK.DS)%TRACK.N;
   o.push([t.toFixed(0),c.s.toFixed(0),(c.vx*3.6).toFixed(0),(ai.prof[idx]*3.6).toFixed(0),c.d.toFixed(1),(c.psi*57.3).toFixed(1),inp.delta.toFixed(3),inp.gas.toFixed(2),inp.brake.toFixed(2),c.gear,c.rpm.toFixed(0),c.alphaF.toFixed(2),c.alphaR.toFixed(2),(kappaAt(c.s)*1000).toFixed(1)].join(' '));}}
 return o.join('\\n');})`,ctx)(id,tmax,every));
