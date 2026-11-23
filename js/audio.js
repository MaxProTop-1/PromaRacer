"use strict";
/* Звук: двигатель по числу цилиндров и оборотам, ветер, визг шин. Всё синтезируется в браузере. */
const AUD = { ctx: null };

function startAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    const eng = ctx.createGain(); eng.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1200;
    const mk = (type, g) => { const o = ctx.createOscillator(); o.type = type; const gn = ctx.createGain(); gn.gain.value = g; o.connect(gn); gn.connect(lp); o.start(); return o; };
    const o1 = mk("sawtooth", 0.5), o2 = mk("square", 0.25), o3 = mk("sawtooth", 0.18);
    lp.connect(eng); eng.connect(master);
    // шум для ветра и шин
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
    const wind = ctx.createGain(); wind.gain.value = 0;
    const wf = ctx.createBiquadFilter(); wf.type = "lowpass"; wf.frequency.value = 500;
    noise().connect(wf); wf.connect(wind); wind.connect(master);
    const sq = ctx.createGain(); sq.gain.value = 0;
    const sf = ctx.createBiquadFilter(); sf.type = "bandpass"; sf.frequency.value = 1500; sf.Q.value = 6;
    noise().connect(sf); sf.connect(sq); sq.connect(master);
    Object.assign(AUD, { ctx, o1, o2, o3, eng, lp, wind, sq });
    if (ctx.state === "suspended") ctx.resume();
  } catch (e) {}
}

function updateAudio(c, on, throttle) {
  if (!AUD.ctx) return;
  const t = AUD.ctx.currentTime, D = c.def;
  const f = c.rpm / 60 * D.cyl / 2;                    // частота вспышек
  AUD.o1.frequency.setTargetAtTime(f, t, 0.03);
  AUD.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
  AUD.o3.frequency.setTargetAtTime(f * (D.cls === "formula" ? 2 : 1.5), t, 0.03);
  AUD.lp.frequency.setTargetAtTime(500 + c.rpm * (D.cls === "formula" ? 0.5 : 0.28) + 900 * throttle, t, 0.05);
  const cut = c.rpmWheel >= D.redline ? 0.45 : 1;       // отсечка на ограничителе
  const vol = on ? (0.05 + 0.10 * throttle) * cut * (c.shiftT > 0 ? 0.3 : 1) : 0;
  AUD.eng.gain.setTargetAtTime(vol, t, 0.04);
  AUD.wind.gain.setTargetAtTime(on ? Math.min(0.25, c.vx * c.vx / 90000) : 0, t, 0.1);
  const slip = Math.max(Math.abs(c.alphaF) - 0.09, Math.abs(c.alphaR) - 0.09, 0) * 2.2 + (c.lockF || c.lockR ? 0.5 : 0) + (c.spinR ? 0.25 : 0);
  AUD.sq.gain.setTargetAtTime(on && c.vx > 4 ? Math.min(0.22, slip * 0.22) : 0, t, 0.05);
}
