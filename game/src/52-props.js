// Ecos del Vacío — dispersión instanciada: espiras de cristal y chatarra de la
// Meridiano. La chatarra existe por diseño: da referencia de escala humana en
// un paisaje donde todo lo demás es gigante.
(function (EV) {
  'use strict';

  // Atributos por instancia: loc3 = vec4(pos.xyz, alturaEscala)
  //                          loc4 = vec4(sinRot, cosRot, escalaXZ, variación)
  function create(terrain, seed) {
    const gl = EV.GL.ctx;
    const noise = EV.makeNoise(seed);

    // --- variantes de espira de cristal -------------------------------------
    const spireVariants = [];
    for (let v = 0; v < 4; v++) spireVariants.push(EV.Geo.crystalSpire(seed + v * 977));

    const groups = [];
    const PER_VARIANT = 900;

    for (let v = 0; v < spireVariants.length; v++) {
      const inst = [];
      let attempts = 0;
      while (inst.length / 8 < PER_VARIANT && attempts < PER_VARIANT * 40) {
        attempts++;
        const x = (noise.rand() * 2 - 1) * terrain.HALF * 0.94;
        const z = (noise.rand() * 2 - 1) * terrain.HALF * 0.94;
        const d = Math.hypot(x, z);
        if (d < 210) continue;                       // deja limpia la arena central
        if (terrain.slopeAt(x, z) > 0.34) continue;  // no en paredes verticales

        // Las vetas de cristal siguen el mismo ruido que colorea el terreno.
        const vein = noise.fbm(x * 0.006 + 41.0, z * 0.006 - 12.0, 3, 2.1, 0.55) * 0.5 + 0.5;
        const y = terrain.heightAt(x, z);
        const exposure = EV.MathUtil.clamp((y + 6) / 40, 0, 1);
        if (noise.rand() > vein * exposure * 1.25) continue;

        const scaleY = 2.2 + noise.rand() * noise.rand() * 16.0;
        const scaleXZ = (0.7 + noise.rand() * 0.7) * (1.0 + scaleY * 0.03);
        const rot = noise.rand() * Math.PI * 2;
        inst.push(x, y - 0.4, z, scaleY, Math.sin(rot), Math.cos(rot), scaleXZ, noise.rand());
      }
      const data = new Float32Array(inst);
      groups.push({ mesh: spireVariants[v], data, count: data.length / 8 });
    }

    // --- rocas: rompen la monotonía de la duna y dan escala de cerca --------
    const rockVariants = [];
    for (let v = 0; v < 3; v++) rockVariants.push(EV.Geo.rock(seed + 3100 + v * 617));
    for (let v = 0; v < rockVariants.length; v++) {
      const inst = [];
      let attempts = 0;
      while (inst.length / 8 < 700 && attempts < 30000) {
        attempts++;
        const x = (noise.rand() * 2 - 1) * terrain.HALF * 0.95;
        const z = (noise.rand() * 2 - 1) * terrain.HALF * 0.95;
        if (Math.hypot(x, z) < 150) continue;
        const slope = terrain.slopeAt(x, z);
        // Las rocas se acumulan donde la arena no se queda: pendientes medias.
        if (noise.rand() > 0.15 + slope * 2.2) continue;
        const y = terrain.heightAt(x, z);
        const sy = 0.35 + noise.rand() * noise.rand() * 3.2;
        const sxz = sy * (0.9 + noise.rand() * 0.8);
        const rot = noise.rand() * Math.PI * 2;
        // Semienterradas: una roca apoyada encima se ve pegada.
        inst.push(x, y - sy * 0.30, z, sy, Math.sin(rot), Math.cos(rot), sxz, noise.rand());
      }
      const data = new Float32Array(inst);
      groups.push({ mesh: rockVariants[v], data, count: data.length / 8, rock: true });
    }

    // --- chatarra de la Meridiano -------------------------------------------
    const debrisMesh = EV.Geo.box(1, 1, 1);
    {
      const inst = [];
      for (let i = 0; i < 260; i++) {
        const ang = noise.rand() * Math.PI * 2;
        // Sembrada en una estela: la nave se partió y regó restos en una línea.
        const t = noise.rand();
        const spread = 60 + t * 520;
        const x = Math.cos(ang * 0.35 + 1.2) * spread + (noise.rand() - 0.5) * 180;
        const z = Math.sin(ang * 0.35 + 1.2) * spread + (noise.rand() - 0.5) * 180;
        if (Math.abs(x) > terrain.HALF * 0.9 || Math.abs(z) > terrain.HALF * 0.9) continue;
        const y = terrain.heightAt(x, z);
        const sy = 0.5 + noise.rand() * noise.rand() * 5.0;
        const sxz = 0.6 + noise.rand() * 2.4;
        const rot = noise.rand() * Math.PI * 2;
        inst.push(x, y + sy * 0.15, z, sy, Math.sin(rot), Math.cos(rot), sxz, noise.rand());
      }
      const data = new Float32Array(inst);
      groups.push({ mesh: debrisMesh, data, count: data.length / 8, debris: true });
    }

    // --- construcción de VAOs instanciados ----------------------------------
    // Cada grupo necesita su propio VAO que combine la geometría base con el
    // buffer de instancias, así que se reconstruye el binding completo.
    for (const g of groups) {
      g.ibuf = EV.GL.buffer(gl.ARRAY_BUFFER, g.data, gl.STATIC_DRAW);
      g.vao = gl.createVertexArray();
      gl.bindVertexArray(g.vao);

      // La malla base guardó su VBO/IBO; los reutilizamos vinculando de nuevo.
      gl.bindBuffer(gl.ARRAY_BUFFER, g.mesh.vboRef);
      const bytes = EV.Geo.STRIDE * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, bytes, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, bytes, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, bytes, 24);

      gl.bindBuffer(gl.ARRAY_BUFFER, g.ibuf);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 0);
      gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 16);
      gl.vertexAttribDivisor(4, 1);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.mesh.iboRef);
      gl.bindVertexArray(null);
    }

    let total = 0;
    for (const g of groups) total += g.count;

    function draw(filter) {
      for (const g of groups) {
        const kind = g.debris ? 'debris' : (g.rock ? 'rock' : 'crystal');
        if (filter && filter !== kind) continue;
        if (g.count === 0) continue;
        gl.bindVertexArray(g.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, g.mesh.indexCount, g.mesh.indexType, 0, g.count);
      }
    }

    return { groups, draw, total };
  }

  EV.Props = { create };
})(window.EV = window.EV || {});
