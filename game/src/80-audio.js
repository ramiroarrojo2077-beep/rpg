// Ecos del Vacío — audio procedural con WebAudio.
// Nada de assets: todo se sintetiza. El traje es el narrador — el estado del
// jugador se oye antes de leerse.
(function (EV) {
  'use strict';

  function create() {
    let ctx = null, master = null, buses = null, started = false;
    const nodes = {};

    function noiseBuffer(seconds, ctxRef) {
      const len = Math.floor(ctxRef.sampleRate * seconds);
      const buf = ctxRef.createBuffer(1, len, ctxRef.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        // Ruido rosa aproximado: más natural que el blanco para viento y polvo.
        const white = Math.random() * 2 - 1;
        last = (last + 0.045 * white) / 1.045;
        d[i] = last * 3.2;
      }
      return buf;
    }

    function start() {
      if (started) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      started = true;

      master = ctx.createGain();
      master.gain.value = 0.85;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 5;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
      master.connect(comp).connect(ctx.destination);

      buses = {
        world: ctx.createGain(),
        suit: ctx.createGain(),
        music: ctx.createGain(),
        ui: ctx.createGain(),
      };
      buses.world.gain.value = 1.0;
      buses.suit.gain.value = 0.85;
      buses.music.gain.value = 0.55;
      buses.ui.gain.value = 0.7;
      for (const k in buses) buses[k].connect(master);

      const nb = noiseBuffer(4, ctx);

      // --- viento: ruido filtrado, el corte sube con la tormenta
      const wind = ctx.createBufferSource();
      wind.buffer = nb; wind.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 420;
      windFilter.Q.value = 0.55;
      const windGain = ctx.createGain();
      windGain.gain.value = 0.10;
      wind.connect(windFilter).connect(windGain).connect(buses.world);
      wind.start();
      nodes.wind = { gain: windGain, filter: windFilter };

      // --- respiración del traje: LFO sobre ruido grave
      const breath = ctx.createBufferSource();
      breath.buffer = nb; breath.loop = true;
      const breathFilter = ctx.createBiquadFilter();
      breathFilter.type = 'lowpass';
      breathFilter.frequency.value = 260;
      const breathGain = ctx.createGain();
      breathGain.gain.value = 0.0;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.28;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.035;
      lfo.connect(lfoGain).connect(breathGain.gain);
      breath.connect(breathFilter).connect(breathGain).connect(buses.suit);
      breath.start(); lfo.start();
      nodes.breath = { gain: breathGain, lfo };

      // --- ventilación térmica: sube de tono con el calor
      const fanOsc = ctx.createOscillator();
      fanOsc.type = 'sawtooth';
      fanOsc.frequency.value = 60;
      const fanFilter = ctx.createBiquadFilter();
      fanFilter.type = 'lowpass';
      fanFilter.frequency.value = 700;
      const fanGain = ctx.createGain();
      fanGain.gain.value = 0.0;
      fanOsc.connect(fanFilter).connect(fanGain).connect(buses.suit);
      fanOsc.start();
      nodes.fan = { osc: fanOsc, gain: fanGain, filter: fanFilter };

      // --- dron precursor: armónicos naturales, sin ritmo ni melodía
      const droneGain = ctx.createGain();
      droneGain.gain.value = 0.0;
      droneGain.connect(buses.music);
      const partials = [55, 82.5, 110, 165, 220];
      nodes.drone = { gain: droneGain, oscs: [] };
      partials.forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = 0.22 / (i + 1);
        // Deriva de afinación: imperfección analógica, nada suena "digital".
        const drift = ctx.createOscillator();
        drift.frequency.value = 0.05 + i * 0.017;
        const driftGain = ctx.createGain();
        driftGain.gain.value = 0.35 + i * 0.2;
        drift.connect(driftGain).connect(o.frequency);
        drift.start();
        o.connect(g).connect(droneGain);
        o.start();
        nodes.drone.oscs.push(o);
      });

      nodes.noiseBuf = nb;
    }

    function resume() {
      if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    // --- eventos puntuales ---------------------------------------------------
    function burst(opts) {
      if (!ctx) return;
      const {
        bus = 'world', freq = 220, type = 'sine', dur = 0.2, gain = 0.4,
        sweep = 0, noise = 0, filter = 1800, q = 1,
      } = opts;
      const t = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(buses[bus] || buses.world);

      if (noise > 0) {
        const n = ctx.createBufferSource();
        n.buffer = nodes.noiseBuf;
        n.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.setValueAtTime(filter, t);
        f.Q.value = q;
        if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, filter + sweep), t + dur);
        const ng = ctx.createGain();
        ng.gain.value = noise;
        n.connect(f).connect(ng).connect(g);
        n.start(t); n.stop(t + dur + 0.02);
      }
      if (freq > 0) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + sweep), t + dur);
        o.connect(g);
        o.start(t); o.stop(t + dur + 0.02);
      }
    }

    const SFX = {
      shot: () => burst({ bus: 'suit', freq: 320, type: 'square', dur: 0.11, gain: 0.20, sweep: -260, noise: 0.5, filter: 2600, q: 0.9 }),
      dash: () => burst({ bus: 'suit', freq: 0, dur: 0.26, gain: 0.30, noise: 1.0, filter: 900, sweep: 1800, q: 0.7 }),
      land: () => burst({ bus: 'world', freq: 70, type: 'sine', dur: 0.16, gain: 0.30, sweep: -40, noise: 0.35, filter: 500 }),
      hardLanding: () => burst({ bus: 'world', freq: 48, type: 'sine', dur: 0.4, gain: 0.5, sweep: -26, noise: 0.5, filter: 300 }),
      hit: () => burst({ bus: 'ui', freq: 180, type: 'square', dur: 0.09, gain: 0.22, sweep: -90 }),
      plateBreak: () => burst({ bus: 'world', freq: 140, type: 'sawtooth', dur: 0.55, gain: 0.45, sweep: -110, noise: 0.9, filter: 1800, q: 0.5 }),
      grapple: () => burst({ bus: 'suit', freq: 900, type: 'triangle', dur: 0.22, gain: 0.22, sweep: -700, noise: 0.25, filter: 2400 }),
      grappleMiss: () => burst({ bus: 'ui', freq: 240, type: 'sine', dur: 0.10, gain: 0.10, sweep: -140 }),
      attach: () => burst({ bus: 'suit', freq: 120, type: 'square', dur: 0.18, gain: 0.30, sweep: 60, noise: 0.4, filter: 700 }),
      climb: () => burst({ bus: 'suit', freq: 260, type: 'triangle', dur: 0.12, gain: 0.16, sweep: 120 }),
      shakenOff: () => burst({ bus: 'world', freq: 90, type: 'sawtooth', dur: 0.5, gain: 0.4, sweep: -50, noise: 0.7, filter: 800 }),
      damage: () => burst({ bus: 'ui', freq: 150, type: 'sawtooth', dur: 0.3, gain: 0.35, sweep: -100, noise: 0.5, filter: 600 }),
      perfectDodge: () => burst({ bus: 'ui', freq: 1200, type: 'sine', dur: 0.3, gain: 0.18, sweep: 500 }),
      overheat: () => burst({ bus: 'suit', freq: 900, type: 'sawtooth', dur: 0.7, gain: 0.22, sweep: -600, noise: 0.4, filter: 3000, q: 3 }),
      titanStep: (intensity) => {
        burst({ bus: 'world', freq: 34, type: 'sine', dur: 0.75, gain: 0.42 * (0.5 + intensity), sweep: -16 });
        burst({ bus: 'world', freq: 0, dur: 0.5, gain: 0.20 * (0.5 + intensity), noise: 1.0, filter: 180, q: 0.5 });
      },
      titanRoar: () => {
        burst({ bus: 'world', freq: 62, type: 'sawtooth', dur: 2.2, gain: 0.42, sweep: -28, noise: 0.5, filter: 420, q: 0.6 });
        burst({ bus: 'world', freq: 41, type: 'sine', dur: 2.6, gain: 0.34, sweep: 12 });
      },
      titanAttack: () => burst({ bus: 'world', freq: 150, type: 'sawtooth', dur: 0.5, gain: 0.35, sweep: -110, noise: 0.7, filter: 900 }),
      titanImpact: () => {
        burst({ bus: 'world', freq: 30, type: 'sine', dur: 1.3, gain: 0.62, sweep: -12 });
        burst({ bus: 'world', freq: 0, dur: 0.9, gain: 0.4, noise: 1.0, filter: 260, sweep: -160, q: 0.4 });
      },
      fracture: () => {
        burst({ bus: 'suit', freq: 220, type: 'square', dur: 0.7, gain: 0.4, sweep: -190, noise: 0.8, filter: 1400 });
        burst({ bus: 'world', freq: 45, type: 'sine', dur: 1.0, gain: 0.45, sweep: -18 });
      },
      absorb: () => {
        burst({ bus: 'music', freq: 55, type: 'sine', dur: 4.0, gain: 0.45, sweep: 30 });
        burst({ bus: 'music', freq: 110, type: 'triangle', dur: 3.5, gain: 0.3, sweep: 22 });
      },
      objective: () => burst({ bus: 'ui', freq: 520, type: 'sine', dur: 0.5, gain: 0.16, sweep: 180 }),
      antenna: () => {
        burst({ bus: 'ui', freq: 330, type: 'triangle', dur: 0.4, gain: 0.18 });
        setTimeout(() => burst({ bus: 'ui', freq: 495, type: 'triangle', dur: 0.6, gain: 0.16 }), 180);
      },
      death: () => burst({ bus: 'ui', freq: 110, type: 'sine', dur: 2.2, gain: 0.4, sweep: -70 }),
    };

    // --- estado continuo -----------------------------------------------------
    function update(dt, state) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const smooth = (param, target, tau) => {
        param.setTargetAtTime(target, t, tau);
      };

      if (nodes.wind) {
        const stormWind = 0.10 + state.storm * 0.42;
        smooth(nodes.wind.gain.gain, state.inHub ? 0.02 : stormWind, 0.6);
        smooth(nodes.wind.filter.frequency, 420 + state.storm * 900 + state.speed * 22, 0.4);
      }
      if (nodes.fan) {
        const h = state.heat / 100;
        smooth(nodes.fan.gain.gain, h * h * 0.13, 0.25);
        smooth(nodes.fan.osc.frequency, 60 + h * 210, 0.2);
        smooth(nodes.fan.filter.frequency, 700 + h * 2600, 0.3);
      }
      if (nodes.breath) {
        const stress = 1 - state.integrity / 100;
        smooth(nodes.breath.gain.gain, 0.03 + stress * 0.09, 0.5);
        nodes.breath.lfo.frequency.setTargetAtTime(0.28 + stress * 0.6, t, 0.5);
      }
      if (nodes.drone) {
        // El dron precursor sólo suena cerca del titán o con corrupción alta.
        const target = Math.max(state.titanProximity * 0.25, state.corruption * 0.35);
        smooth(nodes.drone.gain.gain, target, 1.4);
      }
    }

    return {
      start, resume, update, sfx: SFX,
      get ready() { return !!ctx; },
      get context() { return ctx; },
      setMasterVolume(v) { if (master) master.gain.value = v; },
    };
  }

  EV.Audio = { create };
})(window.EV = window.EV || {});
