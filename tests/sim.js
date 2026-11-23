// node tests/sim.js [carId] [trackIdx]  — симуляция кругов ИИ в ядре без графики
const fs = require("fs"), vm = require("vm"), path = require("path");
const ctx = { console, Math, Float64Array, Float32Array };
vm.createContext(ctx);
for (const f of ["cars", "track", "physics", "ai"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", f + ".js"), "utf8"), ctx, { filename: f });
const run = new vm.Script(`
(function(carIds, trackIdx, laps){
  buildTrack(TRACKS[trackIdx]);
  const out = [];
  out.push('track ' + TRACK.info.id + ' length ' + TRACK.L.toFixed(0) + ' m, minR ' + TRACK.minR.toFixed(0) + ' m');
  for (const id of carIds) {
    const D = CARS[id], c = newVehicle(D); c.auto = true; c.s = -5;
    const ai = newAI(D, 0.97, 0);
    const dt = 1/120; let t = 0, lapStart = 0, lapTimes = [], maxV = 0, offT = 0, wallHits = 0, maxLat = 0, maxLong = 0, minV = 999, lastLap = 0, maxAng = 0;
    let wasWall = false, maxTF = 0, maxTR = 0;
    while (t < laps * 400 && lapTimes.length < laps) {
      const inp = aiDrive(c, ai, dt);
      physStep(c, inp, dt);
      t += dt;
      if (Math.abs(c.d) > ROAD_W/2 + KERB_W) offT += dt;
      if (c.wall > 0 && !wasWall) wallHits++; wasWall = c.wall > 0;
      maxV = Math.max(maxV, c.vx); if (t > 8) minV = Math.min(minV, c.vx);
      maxLat = Math.max(maxLat, Math.abs(c.ay)/GRAV); maxLong = Math.max(maxLong, Math.abs(c.ax)/GRAV);
      maxAng = Math.max(maxAng, Math.abs(c.psi));
      maxTF = Math.max(maxTF, c.tempF); maxTR = Math.max(maxTR, c.tempR);
      const lap = Math.floor(c.s / TRACK.L);
      if (lap > lastLap) { lapTimes.push(t - lapStart); lapStart = t; lastLap = lap; }
    }
    out.push([D.name.padEnd(18), 'laps', lapTimes.map(x => x.toFixed(1)).join('/'), 'vmax', (maxV*3.6).toFixed(0), 'vmin', (minV*3.6).toFixed(0),
      'lat', maxLat.toFixed(2)+'g', 'long', maxLong.toFixed(2)+'g', 'off', offT.toFixed(1)+'s', 'rec', (c.recovered||0), 'walls', wallHits, 'maxPsi', (maxAng*57.3).toFixed(0)+'deg',
      'tire', c.tempF.toFixed(0)+'/'+c.tempR.toFixed(0), 'max', maxTF.toFixed(0)+'/'+maxTR.toFixed(0), 'wear', (c.wearF*100).toFixed(1)+'/'+(c.wearR*100).toFixed(1)+'%'].join(' '));
  }
  return out.join('\\n');
})
`, { filename: "run" }).runInContext(ctx);
const ids = process.argv[2] && process.argv[2] !== "all" ? [process.argv[2]] : ["gtr", "gt3", "f4", "f3", "f2", "f1"];
console.log(run(ids, +(process.argv[3] || 0), +(process.argv[4] || 2)));
