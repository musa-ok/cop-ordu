/* Çöp Ordu — model baker.
   Loads animated glTF characters and bakes each animation into static frame meshes, so hundreds of
   soldiers draw with one instanced call per frame. Skinning (positions and normals) is done here on the
   CPU; per-variant data that never changes (index, uv, colour, team mask) is shared by every frame. */
"use strict";
const BAKE = (() => {
  const loader = new THREE.GLTFLoader();
  const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));

  async function loadAll(map, onProgress){
    const out = {}, keys = Object.keys(map); let done = 0;
    await Promise.all(keys.map(async k => { out[k] = await load(map[k]); done++; onProgress && onProgress(done / keys.length); }));
    return out;
  }

  // linear material colours -> the sRGB-ish colours the rest of the scene is authored in
  function matColor(mat, out){ out.copy(mat.color); out.convertLinearToSRGB(); return out; }

  /* Static meshes of a glTF (props) flattened into geometry + colour per part */
  function staticParts(gltf){
    const parts = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => {
      if(!o.isMesh || o.isSkinnedMesh) return;
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
      if(!g.attributes.normal) g.computeVertexNormals();
      parts.push({ g, name:o.material.name, color:matColor(o.material, new THREE.Color()) });
    });
    return parts;
  }

  function boneMap(root){ const b = {}; root.traverse(o => { if(o.isBone) b[o.name] = o; }); return b; }
  function subClip(clip, keep){
    const c = clip.clone();
    c.tracks = c.tracks.filter(t => keep(t.name.slice(0, t.name.lastIndexOf('.'))));
    return c;
  }
  const UPPER = /^(Abdomen|Torso|Neck|Head|Shoulder|UpperArm|LowerArm|Palm|MiddleHand|Fingers|Thumb|spine|chest|upperarm|lowerarm|wrist|hand|head)/;

  /* One rigged model that can be posed frame by frame */
  class Rig {
    constructor(gltf){
      this.scene = gltf.scene;
      this.clips = {}; for(const c of gltf.animations) this.clips[c.name.split('|').pop()] = c;
      this.mixer = new THREE.AnimationMixer(this.scene);
      this.bones = boneMap(this.scene);
      this.rest = new Map();
      for(const b of Object.values(this.bones)) this.rest.set(b, { p:b.position.clone(), q:b.quaternion.clone(), s:b.scale.clone() });
      this.skinned = []; this.statics = []; this.texture = null;
      this.scene.traverse(o => {
        if(!o.isMesh) return;
        (o.isSkinnedMesh ? this.skinned : this.statics).push(o);
        if(o.material.map && !this.texture) this.texture = o.material.map;
      });
      this.cache = new Map();
    }
    clip(name, part, upper){
      const key = name + '|' + (part||'');
      if(!this.cache.has(key)){
        const c = this.clips[name]; if(!c) throw new Error('clip missing: ' + name);
        const U = upper || UPPER;
        this.cache.set(key, part==='upper' ? subClip(c, n => U.test(n)) : part==='lower' ? subClip(c, n => !U.test(n)) : c);
      }
      return this.cache.get(key);
    }
    pose(layers, poseFn, upper){
      for(const [b, r] of this.rest){ b.position.copy(r.p); b.quaternion.copy(r.q); b.scale.copy(r.s); }
      this.mixer.stopAllAction();
      for(const L of layers){
        const a = this.mixer.clipAction(this.clip(L.clip, L.part, upper));
        a.reset(); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.play();
        a.time = Math.min(L.t, a.getClip().duration - 1e-4); a.weight = 1;
      }
      this.mixer.update(0);
      this.scene.updateMatrixWorld(true);
      if(poseFn){ poseFn(this.bones); this.scene.updateMatrixWorld(true); }
    }
    duration(name){ return this.clips[name].duration; }
  }

  /* ---------- texture sampling (team-colour mask from the palette texture) ---------- */
  const texCache = new Map();
  function texSampler(tex){
    if(texCache.has(tex)) return texCache.get(tex);
    const img = tex.image, w = img.width, h = img.height;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently:true }); cx.drawImage(img, 0, 0);
    const data = cx.getImageData(0, 0, w, h).data;
    cv.width = cv.height = 0;
    const f = (u, v) => {
      u -= Math.floor(u); v -= Math.floor(v);
      const x = Math.min(w-1, Math.floor(u*w)), y = Math.min(h-1, Math.floor((tex.flipY ? 1-v : v)*h)), i = (y*w + x)*4;
      return [data[i]/255, data[i+1]/255, data[i+2]/255];
    };
    texCache.set(tex, f); return f;
  }
  function hsl(r, g, b){
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b), l = (mx+mn)/2, d = mx-mn;
    if(d < 1e-6) return [0, 0, l];
    const s = l > .5 ? d/(2-mx-mn) : d/(mx+mn);
    let h = mx===r ? (g-b)/d + (g<b?6:0) : mx===g ? (b-r)/d + 2 : (r-g)/d + 4;
    return [h/6, s, l];
  }

  /* ---------- sources: every mesh piece that makes up a variant ---------- */
  /* attributes may be interleaved and/or normalised integers: flatten each one once into plain floats */
  const flatCache = new WeakMap();
  function flat(attr){
    if(!attr) return null;
    if(flatCache.has(attr)) return flatCache.get(attr);
    const n = attr.count, k = attr.itemSize, out = new Float32Array(n*k);
    const get = [a=>attr.getX(a), a=>attr.getY(a), a=>attr.getZ(a), a=>attr.getW(a)];
    const arr = attr.isInterleavedBufferAttribute ? attr.data.array : attr.array;
    const div = !attr.normalized ? 1 : arr instanceof Uint8Array ? 255 : arr instanceof Uint16Array ? 65535 : arr instanceof Int8Array ? 127 : arr instanceof Int16Array ? 32767 : 1;
    for(let i=0;i<n;i++) for(let c=0;c<k;c++) out[i*k+c] = get[c](i) / div;
    flatCache.set(attr, out); return out;
  }
  /* ---------- stick figures: limbs stretched between bones, so they inherit every animation of the rig ---------- */
  const stickCache = new Map();
  function stickTemplate(rig, st){
    const key = rig.scene.uuid + JSON.stringify(st);
    if(stickCache.has(key)) return stickCache.get(key);
    rig.pose(st.rest || [], null);
    const P = n => { const b = rig.bones[n]; if(!b) throw new Error('bone missing: ' + n); return b.getWorldPosition(new THREE.Vector3()); };
    const U = P(st.ref[0]).distanceTo(P(st.ref[1]));            // radii are given relative to this body length
    const cyl = new THREE.CylinderGeometry(1, 1, 1, st.radial || 10, 1, true); cyl.translate(0, .5, 0);
    const ball = new THREE.SphereGeometry(1, 7, 5), head = new THREE.SphereGeometry(1, 14, 11);   // small joints stay cheap
    const rock = new THREE.DodecahedronGeometry(1, 0);
    const parts = [];
    for(const [a, b, r, shape] of st.segs) parts.push({ type: shape==='rock' ? 'rock' : 'seg', a, b, r:r*U, g: shape==='rock' ? rock : cyl });
    for(const [bone, r, o] of st.balls || []) parts.push({ type:'ball', bone, r:r*U, up:((o&&o.up)||0)*U, fwd:((o&&o.fwd)||0)*U, sy:(o&&o.sy)||1, g:(o&&o.rock) ? rock : (o&&o.hi) ? head : ball });
    let n = 0; const idx = [];
    for(const p of parts){
      p.off = n; p.pos = flat(p.g.attributes.position); p.nor = flat(p.g.attributes.normal); p.cnt = p.g.attributes.position.count;
      if(p.g.index){ const ix = p.g.index.array; for(let i=0;i<ix.length;i++) idx.push(n + ix[i]); }
      else for(let i=0;i<p.cnt;i++) idx.push(n + i);
      n += p.cnt;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n*3), 3));
    const uv = new Float32Array(n*2); for(let i=0;i<n;i++){ uv[i*2] = st.uv[0]; uv[i*2+1] = st.uv[1]; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const t = { parts, geo, n, mask: st.mask === undefined ? 1 : st.mask };
    stickCache.set(key, t); return t;
  }
  const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sx = new THREE.Vector3(), _sy = new THREE.Vector3(), _sz = new THREE.Vector3(), _sq = new THREE.Quaternion();
  function stickFrame(rig, tpl, N, pos, nor, base){
    const e = N.elements;
    const put = (k, x, y, z, nx, ny, nz) => {
      pos[k]   = e[0]*x + e[4]*y + e[8]*z + e[12];
      pos[k+1] = e[1]*x + e[5]*y + e[9]*z + e[13];
      pos[k+2] = e[2]*x + e[6]*y + e[10]*z + e[14];
      const mx = e[0]*nx + e[4]*ny + e[8]*nz, my = e[1]*nx + e[5]*ny + e[9]*nz, mz = e[2]*nx + e[6]*ny + e[10]*nz, l = Math.hypot(mx,my,mz) || 1;
      nor[k] = mx/l; nor[k+1] = my/l; nor[k+2] = mz/l;
    };
    for(const p of tpl.parts){
      const P = p.pos, Q = p.nor;
      if(p.type === 'ball'){
        const b = rig.bones[p.bone]; b.getWorldPosition(_sa);
        if(p.up || p.fwd){ b.getWorldQuaternion(_sq); _sa.add(_sb.set(0, p.up, p.fwd).applyQuaternion(_sq)); }
        for(let i=0;i<p.cnt;i++){
          const k = (base + p.off + i)*3;
          put(k, _sa.x + P[i*3]*p.r, _sa.y + P[i*3+1]*p.r*p.sy, _sa.z + P[i*3+2]*p.r, Q[i*3], Q[i*3+1], Q[i*3+2]);
        }
        continue;
      }
      rig.bones[p.a].getWorldPosition(_sa); rig.bones[p.b].getWorldPosition(_sb);
      _sy.subVectors(_sb, _sa); const len = _sy.length() || 1e-4; _sy.divideScalar(len);
      _sx.set(1,0,0); if(Math.abs(_sy.x) > .9) _sx.set(0,0,1);
      _sz.crossVectors(_sx, _sy).normalize(); _sx.crossVectors(_sy, _sz).normalize();
      const rock = p.type === 'rock', ly = rock ? len*.62 : len, ox = rock ? (_sa.x+_sb.x)/2 : _sa.x, oy = rock ? (_sa.y+_sb.y)/2 : _sa.y, oz = rock ? (_sa.z+_sb.z)/2 : _sa.z;
      for(let i=0;i<p.cnt;i++){
        const lx = P[i*3]*p.r, lyy = P[i*3+1]*ly, lz = P[i*3+2]*p.r, nx = Q[i*3], ny = Q[i*3+1], nz = Q[i*3+2];
        const k = (base + p.off + i)*3;
        put(k, ox + _sx.x*lx + _sy.x*lyy + _sz.x*lz, oy + _sx.y*lx + _sy.y*lyy + _sz.y*lz, oz + _sx.z*lx + _sy.z*lyy + _sz.z*lz,
               _sx.x*nx + _sy.x*ny + _sz.x*nz, _sx.y*nx + _sy.y*ny + _sz.y*nz, _sx.z*nx + _sy.z*ny + _sz.z*nz);
      }
    }
  }

  function collectSources(rig, spec){
    const hide = spec.hide, out = [];
    if(spec.stick){ const tpl = stickTemplate(rig, spec.stick); out.push({ kind:'stick', tpl, geo:tpl.geo }); }
    for(const sm of rig.skinned) if(!(hide && hide.test(sm.name))) out.push({ kind:'skin', mesh:sm, geo:sm.geometry, mat:sm.material });
    for(const st of rig.statics) if(!(hide && hide.test(st.name))) out.push({ kind:'static', mesh:st, geo:st.geometry, mat:st.material });
    for(const a of spec.attach || []) for(const p of a.parts) out.push({ kind:'attach', att:a, geo:p.g, part:p });
    return out;
  }
  /* index, uv, colour and team mask — identical for every frame of the variant */
  function sharedAttributes(rig, spec, srcs){
    let n = 0; for(const s of srcs) n += s.geo.attributes.position.count;
    const uv = new Float32Array(n*2), col = new Float32Array(n*3), mask = new Float32Array(n), idx = [];
    const sample = rig.texture && spec.accent ? texSampler(rig.texture) : null;
    const c = new THREE.Color();
    let base = 0;
    for(const s of srcs){
      const g = s.geo, cnt = g.attributes.position.count, uva = flat(g.attributes.uv);
      let m = 0;
      if(s.kind==='stick'){ c.setRGB(1,1,1); m = s.tpl.mask; }
      else if(s.kind==='attach'){
        const t = s.att.tint && s.att.tint[s.part.name];
        c.copy(t && t.color!==undefined ? new THREE.Color(t.color) : s.part.color); m = t ? (t.mask||0) : 0;
      } else if(s.mat.map){ c.setRGB(1,1,1); }
      else {
        matColor(s.mat, c);
        const t = spec.tint && spec.tint[s.mat.name];
        if(t){ if(t.color!==undefined) c.set(t.color); m = t.mask||0; }
      }
      for(let i=0;i<cnt;i++){
        const k = base+i;
        if(s.kind==='attach' && s.part.uv){ uv[k*2] = s.part.uv[0]; uv[k*2+1] = s.part.uv[1]; }   // props painted from one palette texel
        else if(uva){ uv[k*2] = uva[i*2]; uv[k*2+1] = uva[i*2+1]; }
        col[k*3] = c.r; col[k*3+1] = c.g; col[k*3+2] = c.b;
        let mk = m;
        if(sample && uva && s.mat && s.mat.map){ const [r,gg,b] = sample(uv[k*2], uv[k*2+1]); const [h,sat,l] = hsl(r,gg,b); mk = +spec.accent(h,sat,l) || 0; }
        mask[k] = mk;
      }
      if(g.index){ const ix = g.index.array; for(let i=0;i<ix.length;i++) idx.push(base + ix[i]); }
      else for(let i=0;i<cnt;i++) idx.push(base + i);
      base += cnt;
    }
    return {
      n,
      uv: new THREE.BufferAttribute(uv, 2),
      color: new THREE.BufferAttribute(col, 3),
      teamMask: new THREE.BufferAttribute(mask, 1),
      index: new THREE.BufferAttribute(n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1),
    };
  }

  /* Skin the current pose into pos/nor arrays (N maps model space to game space) */
  const _A = new THREE.Matrix4(), _B = new THREE.Matrix4(), _M = new THREE.Matrix4(), _o = new THREE.Matrix4(),
        _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _v = new THREE.Vector3();
  function skinFrame(rig, srcs, N, n, spec){
    const pos = new Float32Array(n*3), nor = new Float32Array(n*3);
    let base = 0;
    for(const s of srcs){
      if(s.kind==='stick'){ stickFrame(rig, s.tpl, N, pos, nor, base); base += s.tpl.n; continue; }
      const g = s.geo, cnt = g.attributes.position.count, P = flat(g.attributes.position), Nn = flat(g.attributes.normal);
      if(s.kind==='skin'){
        const sm = s.mesh, bones = sm.skeleton.bones, inv = sm.skeleton.boneInverses, nb = bones.length;
        const mats = new Float32Array(nb*16);
        _B.multiplyMatrices(N, sm.matrixWorld).multiply(sm.bindMatrixInverse);
        for(let b=0;b<nb;b++){
          _A.multiplyMatrices(bones[b].matrixWorld, inv[b]).multiply(sm.bindMatrix);
          _M.multiplyMatrices(_B, _A); mats.set(_M.elements, b*16);
        }
        const SI = flat(g.attributes.skinIndex), SW = flat(g.attributes.skinWeight);
        for(let i=0;i<cnt;i++){
          const x=P[i*3], y=P[i*3+1], z=P[i*3+2];
          const nx=Nn?Nn[i*3]:0, ny=Nn?Nn[i*3+1]:1, nz=Nn?Nn[i*3+2]:0;
          let ox=0, oy=0, oz=0, mx=0, my=0, mz=0;
          for(let k=0;k<4;k++){
            const w = SW[i*4+k]; if(w===0) continue;
            const e = SI[i*4+k]*16;
            ox += w*(mats[e]*x + mats[e+4]*y + mats[e+8]*z + mats[e+12]);
            oy += w*(mats[e+1]*x + mats[e+5]*y + mats[e+9]*z + mats[e+13]);
            oz += w*(mats[e+2]*x + mats[e+6]*y + mats[e+10]*z + mats[e+14]);
            mx += w*(mats[e]*nx + mats[e+4]*ny + mats[e+8]*nz);
            my += w*(mats[e+1]*nx + mats[e+5]*ny + mats[e+9]*nz);
            mz += w*(mats[e+2]*nx + mats[e+6]*ny + mats[e+10]*nz);
          }
          const k3=(base+i)*3, l=Math.hypot(mx,my,mz)||1;
          pos[k3]=ox; pos[k3+1]=oy; pos[k3+2]=oz; nor[k3]=mx/l; nor[k3+1]=my/l; nor[k3+2]=mz/l;
        }
      } else {
        if(s.kind==='static'){
          _M.multiplyMatrices(N, s.mesh.matrixWorld);
          const k = spec && spec.propScale;
          if(k && s.mesh.parent && s.mesh.parent.isBone){
            const Pm = s.mesh.parent.matrixWorld;
            _o.copy(Pm).invert().premultiply(new THREE.Matrix4().makeScale(k,k,k)).premultiply(Pm);   // P · S · P⁻¹
            _M.multiplyMatrices(N, _o).multiply(s.mesh.matrixWorld);
          }
        }
        else {
          const a = s.att, bone = rig.bones[a.bone];
          bone.matrixWorld.decompose(_p, _q, _s);
          const sb = _s.x;
          _e.set(...(a.rot || [0,0,0]));
          _o.compose(_v.set(...(a.pos || [0,0,0])).multiplyScalar(1/sb), new THREE.Quaternion().setFromEuler(_e), new THREE.Vector3(1,1,1).multiplyScalar((a.scale||1)/sb));
          _M.multiplyMatrices(N, bone.matrixWorld).multiply(_o);
        }
        const e = _M.elements;
        for(let i=0;i<cnt;i++){
          const x=P[i*3], y=P[i*3+1], z=P[i*3+2], k3=(base+i)*3;
          pos[k3]=e[0]*x+e[4]*y+e[8]*z+e[12]; pos[k3+1]=e[1]*x+e[5]*y+e[9]*z+e[13]; pos[k3+2]=e[2]*x+e[6]*y+e[10]*z+e[14];
          const nx=Nn?Nn[i*3]:0, ny=Nn?Nn[i*3+1]:1, nz=Nn?Nn[i*3+2]:0;
          const mx=e[0]*nx+e[4]*ny+e[8]*nz, my=e[1]*nx+e[5]*ny+e[9]*nz, mz=e[2]*nx+e[6]*ny+e[10]*nz, l=Math.hypot(mx,my,mz)||1;
          nor[k3]=mx/l; nor[k3+1]=my/l; nor[k3+2]=mz/l;
        }
      }
      base += cnt;
    }
    return { pos, nor };
  }

  /* Normalisation: model space -> game space (feet on y=0, facing +Z, given height) */
  function normalizer(rig, spec, srcs, n){
    rig.pose(spec.measure || [], spec.poseFn ? b => spec.poseFn(b, 'measure', 0) : null, spec.upper);
    const msrcs = spec.measureHide !== undefined ? collectSources(rig, { hide:spec.measureHide, stick:spec.stick }) : srcs;
    let mn = 0; for(const s of msrcs) mn += s.geo.attributes.position.count;
    const { pos } = skinFrame(rig, msrcs, new THREE.Matrix4(), mn, spec);
    const box = new THREE.Box3(), v = new THREE.Vector3();
    for(let i=0;i<pos.length;i+=3) box.expandByPoint(v.set(pos[i], pos[i+1], pos[i+2]));
    const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const s = spec.height / size.y;
    return new THREE.Matrix4()
      .makeRotationY(spec.rotY || 0)
      .multiply(new THREE.Matrix4().makeScale(s, s, s))
      .multiply(new THREE.Matrix4().makeTranslation(-ctr.x, -box.min.y, -ctr.z));
  }

  function makeGeometry(shared, frame){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(frame.pos, 3));
    const ni = new Int16Array(frame.nor.length); for(let i=0;i<ni.length;i++) ni[i] = Math.round(frame.nor[i]*32767);
    g.setAttribute('normal', new THREE.BufferAttribute(ni, 3, true));
    g.setAttribute('uv', shared.uv); g.setAttribute('color', shared.color); g.setAttribute('teamMask', shared.teamMask);
    g.setIndex(shared.index);
    g.computeBoundingSphere();
    return g;
  }

  /* Bake every animation of a variant: { key: [geometry per frame] } */
  function bake(rig, spec){
    const srcs = collectSources(rig, spec);
    const shared = sharedAttributes(rig, spec, srcs);
    const N = normalizer(rig, spec, srcs, shared.n);
    const out = {};
    for(const [key, a] of Object.entries(spec.anims)){
      out[key] = [];
      for(let f = 0; f < a.frames; f++){
        const u = a.loop ? f / a.frames : (a.frames > 1 ? f / (a.frames - 1) : 0);
        const layers = a.layers.map(L => ({ clip:L.clip, part:L.part, t:((L.at !== undefined ? L.at : u) * (L.span || 1) + (L.from || 0)) * rig.duration(L.clip) }));
        rig.pose(layers, spec.poseFn ? b => spec.poseFn(b, key, u) : null, spec.upper);
        out[key].push(makeGeometry(shared, skinFrame(rig, srcs, N, shared.n, spec)));
      }
    }
    out.texture = rig.texture && spec.accent !== undefined ? rig.texture : (spec.useTexture ? rig.texture : null);
    return out;
  }

  /* Turn a bone so it points along a direction given in model space (used to build custom poses) */
  const _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _y = new THREE.Vector3(), _d = new THREE.Vector3();
  function aim(bone, x, y, z){
    bone.updateWorldMatrix(true, false);
    bone.getWorldQuaternion(_wq);
    _y.set(0,1,0).applyQuaternion(_wq).normalize();
    _dq.setFromUnitVectors(_y, _d.set(x,y,z).normalize());
    bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.copy(_pq.invert().multiply(_dq.multiply(_wq)));
    bone.updateMatrixWorld(true);
  }

  return { loadAll, staticParts, Rig, bake, boneMap, aim, hsl };
})();
