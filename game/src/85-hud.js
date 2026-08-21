// Ecos del Vacío — HUD.
// Regla del documento de UX: todo lo que se puede mostrar en el mundo no va en
// la pantalla. Lo que queda acá es lo mínimo, y vive en el borde del visor.
(function (EV) {
  'use strict';

  const M = EV.MathUtil;
  const FONT = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  function create(canvas) {
    const ctx = canvas.getContext('2d');
    let W = 1, H = 1, dpr = 1;

    const state = {
      objective: '',
      objectiveHint: '',
      subtitle: '',
      subtitleTimer: 0,
      prompt: '',
      toast: '',
      toastTimer: 0,
      extendedHUD: false,
    };

    function resize(w, h, ratio) {
      dpr = ratio;
      W = w; H = h;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function say(text, seconds) {
      state.subtitle = text;
      state.subtitleTimer = seconds || 4.0;
    }
    function toast(text, seconds) {
      state.toast = text;
      state.toastTimer = seconds || 3.0;
    }

    function update(dt) {
      state.subtitleTimer = Math.max(0, state.subtitleTimer - dt);
      state.toastTimer = Math.max(0, state.toastTimer - dt);
    }

    // --- primitivas de dibujo ------------------------------------------------
    function arc(cx, cy, r, from, to, width, color, alpha) {
      ctx.globalAlpha = alpha === undefined ? 1 : alpha;
      ctx.beginPath();
      ctx.arc(cx, cy, r, from, to);
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function text(str, x, y, opts = {}) {
      const {
        size = 13, color = 'rgba(232,226,214,0.86)', align = 'left',
        weight = '400', alpha = 1, letter = 0.5, shadow = true,
      } = opts;
      ctx.globalAlpha = alpha;
      ctx.font = `${weight} ${size}px ${FONT}`;
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      if (letter && ctx.letterSpacing !== undefined) ctx.letterSpacing = letter + 'px';
      if (shadow) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(str, x + 1, y + 1);
      }
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
      if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
      ctx.globalAlpha = 1;
    }

    // --- HUD principal -------------------------------------------------------
    function draw(game) {
      ctx.clearRect(0, 0, W, H);
      const p = game.player;
      if (!p) return;

      const cx = W * 0.5, cy = H * 0.5;

      // ---- retícula mínima: sólo un punto, y sólo si el arma está lista
      if (!p.dead && game.mode === 'play') {
        const ready = p.fireCooldown <= 0 && p.ammo > 0;
        ctx.globalAlpha = ready ? 0.55 : 0.22;
        ctx.fillStyle = '#e8e2d6';
        ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
        ctx.globalAlpha = 1;
        if (p.attached) {
          arc(cx, cy, 16, 0, Math.PI * 2, 1, 'rgba(232,226,214,0.35)', 0.6);
        }
      }

      // ---- anillo térmico en el borde del visor
      // Sube por la izquierda; al saturar, parpadea en ámbar quemado.
      const heat = p.heat / 100;
      const ringR = Math.min(W * 0.34, H * 0.40);
      const start = Math.PI * 0.80, end = Math.PI * 1.20;
      arc(cx, cy, ringR, start, end, 2, 'rgba(232,226,214,0.09)', 1);
      if (heat > 0.01) {
        const hot = p.overheated > 0;
        const col = hot
          ? `rgba(255,${90 + Math.sin(game.time * 30) * 40},60,0.95)`
          : `rgba(255,${190 - heat * 110},${120 - heat * 90},0.85)`;
        arc(cx, cy, ringR, start, start + (end - start) * heat, 2.5, col, 1);
      }

      // ---- integridad del traje: arco derecho
      const integ = p.integrity / p.maxIntegrity;
      const s2 = Math.PI * 1.80, e2 = Math.PI * 2.20;
      arc(cx, cy, ringR, s2, e2, 2, 'rgba(232,226,214,0.09)', 1);
      const dangerous = integ < 0.35;
      arc(cx, cy, ringR, s2, s2 + (e2 - s2) * integ, 2.5,
        dangerous ? `rgba(255,80,60,${0.7 + Math.sin(game.time * 8) * 0.25})` : 'rgba(200,220,232,0.75)', 1);

      // ---- munición, abajo a la derecha (contador del arma)
      if (!p.dead) {
        text('/ ' + p.reserve, W - 30, H - 30, {
          size: 11, align: 'right', color: 'rgba(232,226,214,0.38)',
        });
        text(String(p.ammo).padStart(2, '0'), W - 30, H - 46, {
          size: 24, align: 'right',
          color: p.ammo === 0 ? 'rgba(255,110,80,0.9)' : 'rgba(232,226,214,0.82)',
        });
        if (p.reloadTimer > 0) {
          text('RECARGANDO', W - 30, H - 14, { size: 10, align: 'right', color: 'rgba(255,190,120,0.8)' });
        }
      }

      // ---- objetivo, arriba a la izquierda, en lenguaje de razonamiento
      if (state.objective) {
        text('REGISTRO DE EXPEDICIÓN', 30, 38, { size: 9, color: 'rgba(232,226,214,0.35)', letter: 2 });
        text(state.objective, 30, 58, { size: 14, color: 'rgba(232,226,214,0.88)' });
        if (state.objectiveHint) {
          text(state.objectiveHint, 30, 78, { size: 11, color: 'rgba(232,226,214,0.45)' });
        }
      }

      // ---- estado del titán: sólo cuando está despierto y a la vista
      if (game.titan && game.titan.alive && game.titanAwake) {
        const brokenCount = game.titan.plates.filter(x => x.userData.broken).length;
        const total = game.titan.plates.length;
        const bw = 210, bx = cx - bw / 2, by = 30;
        text('EL BARRENADOR', cx, by - 6, {
          size: 10, align: 'center', color: 'rgba(232,226,214,0.5)', letter: 2,
        });
        // Blindaje como segmentos: es la lectura de progreso, no una barra de HP.
        const segW = bw / total;
        for (let i = 0; i < total; i++) {
          const broken = game.titan.plates[i].userData.broken;
          const dmg = 1 - game.titan.plates[i].userData.hp / game.titan.plates[i].userData.maxHp;
          ctx.fillStyle = broken ? 'rgba(255,120,70,0.25)' : `rgba(232,226,214,${0.30 + dmg * 0.5})`;
          ctx.fillRect(bx + i * segW + 2, by + 4, segW - 4, 4);
        }
        if (game.titan.core.visible) {
          const pulse = 0.6 + Math.sin(game.time * 7) * 0.3;
          text('NÚCLEO EXPUESTO', cx, by + 26, {
            size: 12, align: 'center', color: `rgba(255,170,80,${pulse})`, letter: 1.5,
          });
        }
        // Ciclos completados
        if (game.titan.cycle > 0) {
          text(`CICLO ${game.titan.cycle + 1} / 3`, cx, by + 44, {
            size: 9, align: 'center', color: 'rgba(232,226,214,0.35)', letter: 2,
          });
        }
      }

      // ---- indicador de anclaje disponible (gancho)
      if (game.grappleAvailable && !p.attached && !p.dead) {
        const a = 0.5 + Math.sin(game.time * 5) * 0.2;
        text('◦ ANCLAJE A RANGO — [E]', cx, H - 96, {
          size: 11, align: 'center', color: `rgba(150,215,255,${a})`, letter: 1.5,
        });
      }

      // ---- prompt contextual
      if (state.prompt && !p.dead) {
        text(state.prompt, cx, H - 74, {
          size: 13, align: 'center', color: 'rgba(232,226,214,0.85)',
        });
      }

      // ---- aviso de sobrecalentamiento
      if (p.overheated > 0) {
        text('TRAJE SOBRECALENTADO', cx, cy + ringR * 0.55, {
          size: 13, align: 'center', color: `rgba(255,110,70,${0.6 + Math.sin(game.time * 18) * 0.3})`, letter: 2,
        });
      }

      // ---- tormenta
      if (game.storm > 0.25) {
        text('TORMENTA DE CRISTAL — VISIBILIDAD REDUCIDA', cx, 96, {
          size: 10, align: 'center', color: `rgba(255,200,140,${0.3 + game.storm * 0.4})`, letter: 2,
        });
      }

      // ---- HUD extendido opcional (opción de accesibilidad, sin juicio)
      if (state.extendedHUD) {
        drawBar(24, H - 60, 160, 8, integ, 'INTEGRIDAD', 'rgba(200,220,232,0.8)');
        drawBar(24, H - 40, 160, 8, heat, 'TÉRMICA',
          p.overheated > 0 ? 'rgba(255,90,60,0.9)' : 'rgba(255,170,90,0.8)');
      }

      // ---- subtítulos
      if (state.subtitleTimer > 0) {
        const a = Math.min(1, state.subtitleTimer / 0.4);
        ctx.globalAlpha = a;
        const lines = wrap(state.subtitle, 66);
        lines.forEach((ln, i) => {
          text(ln, cx, H - 42 + i * 18 - (lines.length - 1) * 18, {
            size: 14, align: 'center', color: 'rgba(240,236,228,0.94)',
          });
        });
        ctx.globalAlpha = 1;
      }

      // ---- aviso momentáneo
      if (state.toastTimer > 0) {
        const a = Math.min(1, state.toastTimer / 0.5);
        text(state.toast, cx, cy - 90, {
          size: 17, align: 'center', color: `rgba(255,205,150,${a})`, letter: 2,
        });
      }

      // ---- muerte
      if (p.dead) {
        ctx.fillStyle = 'rgba(6,4,3,0.55)';
        ctx.fillRect(0, 0, W, H);
        text('SEÑAL PERDIDA', cx, cy - 8, {
          size: 30, align: 'center', color: 'rgba(255,120,90,0.9)', letter: 6,
        });
        text('el traje reinicia desde el último anclaje', cx, cy + 22, {
          size: 12, align: 'center', color: 'rgba(232,226,214,0.5)',
        });
      }

      // ---- victoria / absorción
      if (game.mode === 'absorb') {
        const t = M.clamp(game.absorbTime / 6.0, 0, 1);
        ctx.fillStyle = `rgba(8,6,10,${t * 0.5})`;
        ctx.fillRect(0, 0, W, H);
        text('ABSORCIÓN DE NÚCLEO', cx, cy - 20, {
          size: 22, align: 'center', color: `rgba(255,190,110,${0.5 + t * 0.5})`, letter: 5,
        });
        const bw = 320;
        ctx.fillStyle = 'rgba(232,226,214,0.15)';
        ctx.fillRect(cx - bw / 2, cy + 6, bw, 3);
        ctx.fillStyle = 'rgba(255,180,90,0.85)';
        ctx.fillRect(cx - bw / 2, cy + 6, bw * t, 3);
        if (t > 0.98) {
          text('FRACTURA — DESBLOQUEADA   [F]', cx, cy + 44, {
            size: 14, align: 'center', color: 'rgba(255,220,170,0.95)', letter: 3,
          });
        }
      }
    }

    function drawBar(x, y, w, h, v, label, color) {
      ctx.fillStyle = 'rgba(232,226,214,0.10)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w * M.clamp(v, 0, 1), h);
      text(label, x, y - 4, { size: 9, color: 'rgba(232,226,214,0.4)', letter: 1.5 });
    }

    function wrap(str, maxChars) {
      const words = str.split(' ');
      const lines = [];
      let cur = '';
      for (const w of words) {
        if ((cur + ' ' + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; }
        else cur += ' ' + w;
      }
      if (cur.trim()) lines.push(cur.trim());
      return lines;
    }

    return { resize, draw, update, say, toast, state };
  }

  EV.HUD = { create };
})(window.EV = window.EV || {});
