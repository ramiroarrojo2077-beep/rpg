// Ecos del Vacío — ruido determinista para generar Kether-3.
// Simplex 2D/3D con permutación sembrada: el planeta es siempre el mismo.
(function (EV) {
  'use strict';

  function makeNoise(seed) {
    // xorshift32 para una permutación reproducible
    let s = seed >>> 0 || 1;
    const rnd = () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };

    const perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    const grad2 = new Float32Array([
      1, 1, -1, 1, 1, -1, -1, -1,
      1, 0, -1, 0, 1, 0, -1, 0,
      0, 1, 0, -1, 0, 1, 0, -1,
    ]);

    function simplex2(xin, yin) {
      const s2 = (xin + yin) * F2;
      const i = Math.floor(xin + s2), j = Math.floor(yin + s2);
      const t = (i + j) * G2;
      const x0 = xin - (i - t), y0 = yin - (j - t);
      let i1, j1;
      if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let n = 0;

      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 > 0) {
        const gi = (perm[ii + perm[jj]] % 12) * 2;
        t0 *= t0;
        n += t0 * t0 * (grad2[gi] * x0 + grad2[gi + 1] * y0);
      }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 > 0) {
        const gi = (perm[ii + i1 + perm[jj + j1]] % 12) * 2;
        t1 *= t1;
        n += t1 * t1 * (grad2[gi] * x1 + grad2[gi + 1] * y1);
      }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 > 0) {
        const gi = (perm[ii + 1 + perm[jj + 1]] % 12) * 2;
        t2 *= t2;
        n += t2 * t2 * (grad2[gi] * x2 + grad2[gi + 1] * y2);
      }
      return 70 * n;
    }

    // fBm clásico
    function fbm(x, y, octaves, lacunarity, gain) {
      let amp = 0.5, freq = 1, sum = 0, norm = 0;
      for (let o = 0; o < octaves; o++) {
        sum += amp * simplex2(x * freq, y * freq);
        norm += amp;
        freq *= lacunarity;
        amp *= gain;
      }
      return sum / norm;
    }

    // Ruido de cresta: genera filos afilados, ideal para dunas cristalizadas.
    function ridged(x, y, octaves, lacunarity, gain) {
      let amp = 0.5, freq = 1, sum = 0, norm = 0, prev = 1;
      for (let o = 0; o < octaves; o++) {
        let n = 1 - Math.abs(simplex2(x * freq, y * freq));
        n *= n;
        n *= prev;
        prev = n;
        sum += amp * n;
        norm += amp;
        freq *= lacunarity;
        amp *= gain;
      }
      return sum / norm;
    }

    function rand() { return rnd(); }
    function randRange(a, b) { return a + rnd() * (b - a); }

    return { simplex2, fbm, ridged, rand, randRange };
  }

  EV.makeNoise = makeNoise;
})(window.EV = window.EV || {});
