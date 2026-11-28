// node tests/touch.js — режим "телефон, касанием": запуск, наклон -> руль, возврат в меню
const fs=require("fs"),vm=require("vm"),path=require("path");
const stub=new Proxy(function(){},{get:(t,p)=>p===Symbol.toPrimitive?()=>0:(p==="then"?undefined:(p==="length"?0:stub)),apply:()=>stub,construct:()=>stub,set:()=>true});
let raf=null;const els={};
const ctx={console,Math,Float64Array,Float32Array,Date,Promise,setTimeout,THREE:stub,window:null,performance:{now:()=>0},screen:{},navigator:{},
 document:{getElementById:id=>els[id]||(els[id]=new Proxy({style:{},innerHTML:"",textContent:"",classList:{add(){},remove(){}},addEventListener(){}},{get:(t,p)=>p in t?t[p]:stub,set:(t,p,v)=>(t[p]=v,true)})),createElement:()=>stub,body:stub},
 addEventListener(){},setInterval(){},requestAnimationFrame:cb=>{raf=cb},innerWidth:800,innerHeight:400,devicePixelRatio:1};
ctx.window=ctx;vm.createContext(ctx);
for(const f of["cars","track","physics","ai","input","audio","render","main"])vm.runInContext(fs.readFileSync(path.join(__dirname,"../js",f+".js"),"utf8"),ctx,{filename:f});
const run=s=>vm.runInContext(s,ctx);
run(`G.touchSteer="tilt";`);
(async()=>{
  await run(`begin("touch")`);
  console.log("touch mode:",run("G.touch"),"state:",run("G.state"),"overlay:",els.touch.style.display,"btn L hidden:",els.tL.style.display,"cal shown:",els.tCal.style.display);
  // наклон: ref=0, угол +0.48 рад (~27.5 град) -> ~0.5 руля
  run(`tilt.have=true;tilt.ref=0;tilt.ang=0.48;`); let a=run("tiltSteer()");
  run(`tilt.ang=-2.0;`); let b=run("tiltSteer()");
  run(`tilt.invert=true;tilt.ang=0.48;`); let c=run("tiltSteer()");
  run(`tilt.invert=false;tilt.ang=3.0;tilt.ref=-3.0;`); let d=run("tiltSteer()");   // переход через ±pi: разница 6.0 -> -0.28 рад
  console.log("steer(0.48)=",a.toFixed(2)," steer(-2.0)=",b.toFixed(2)," inverted=",c.toFixed(2)," wrap=",d.toFixed(2));
  // шаги кадра: руль должен следовать за наклоном
  run(`tilt.ref=0;tilt.ang=0.48;`);
  let now=0;for(let i=0;i<120;i++){now+=16.7;raf(now);}
  console.log("input.steer after 2 s tilt:",run("input.steer").toFixed(2),"state:",run("G.state"),"time:",run("G.t").toFixed(1));
  // руль на экране: удержание держит угол, отпускание возвращает в центр
  run(`G.screen="touch";G.touchSteer="wheel";`); await run(`begin()`);
  run(`wheelUI.v=0.6;wheelUI.held=true;`); for(let i=0;i<60;i++){now+=16.7;raf(now);}
  const held=run("input.steer");
  run(`wheelUI.held=false;`); for(let i=0;i<180;i++){now+=16.7;raf(now);}
  console.log("wheel held:",held.toFixed(2),"after release:",run("input.steer").toFixed(2),"(ожидается 0.60 и ~0.00)");
  run(`toMenu()`); console.log("back to menu: touchMode",run("input.touchMode"),"overlay",els.touch.style.display);
})();
