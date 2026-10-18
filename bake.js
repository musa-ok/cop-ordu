/* Çöp Ordu — model baker.
   Loads the animated glTF characters (Quaternius, CC0) and bakes each animation into a handful of
   static frame geometries, so hundreds of soldiers can be drawn with one instanced draw call per frame. */
"use strict";
const BAKE = (() => {
  const loader = new THREE.GLTFLoader();
  const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));

  async function loadAll(map, onProgress){
    const out = {}, keys = Object.keys(map); let done = 0;
    await Promise.all(keys.map(async k => { out[k] = await load(map[k]); done++; onProgress && onProgress(done / keys.length); }));
    return out;
  }

  const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _o = new THREE.Matrix4(), _q = new THREE.Quaternion(),
        _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

  // linear material colours -> the sRGB-ish colours the rest of the scene is authored in
  function matColor(mat, out){ out.copy(mat.color); out.convertLinearToSRGB(); return out; }

  /* Static meshes of a glTF (weapons, helmets) flattened into geometry + colour per part */
  function staticParts(gltf){
    const parts = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => {
      if(!o.isMesh || o.isSkinnedMesh) return;
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
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
  const UPPER = /^(Abdomen|Torso|Neck|Head|Shoulder|UpperArm|LowerArm|Palm|MiddleHand|Fingers|Thumb)/;

  /* One rigged model, posed per frame and flattened (skinned verts + attached props) */
  class Rig {
    constructor(gltf){
      this.scene = gltf.scene;
      this.clips = {}; for(const c of gltf.animations) this.clips[c.name.split('|').pop()] = c;
      this.mixer = new THREE.AnimationMixer(this.scene);
      this.bones = boneMap(this.scene);
      this.rest = new Map();
      for(const b of Object.values(this.bones)) this.rest.set(b, { p:b.position.clone(), q:b.quaternion.clone(), s:b.scale.clone() });
      this.skinned = []; this.scene.traverse(o => { if(o.isSkinnedMesh) this.skinned.push(o); });
      this.statics = []; this.scene.traverse(o => { if(o.isMesh && !o.isSkinnedMesh) this.statics.push(o); });
      this.cache = new Map();
    }
    clip(name, part){
      const key = name + '|' + (part||'');
      if(!this.cache.has(key)){
        const c = this.clips[name]; if(!c) throw new Error('clip missing: ' + name);
        this.cache.set(key, part==='upper' ? subClip(c, n => UPPER.test(n)) : part==='lower' ? subClip(c, n => !UPPER.test(n)) : c);
      }
      return this.cache.get(key);
    }
    /* layers: [{clip, part, t}] — t in seconds */
    pose(layers, poseFn){
      for(const [b, r] of this.rest){ b.position.copy(r.p); b.quaternion.copy(r.q); b.scale.copy(r.s); }
      this.mixer.stopAllAction();
      for(const L of layers){
        const a = this.mixer.clipAction(this.clip(L.clip, L.part));
        a.reset(); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.play();
        a.time = Math.min(L.t, a.getClip().duration - 1e-4); a.weight = 1;
      }
      this.mixer.update(0);
      this.scene.updateMatrixWorld(true);
      if(poseFn){ poseFn(this.bones); this.scene.updateMatrixWorld(true); }
    }
    duration(name){ return this.clips[name].duration; }
  }

  /* Flatten the current pose into arrays */
  function flatten(rig, spec, N){
    const pos = [], col = [], mask = [], idx = [];
    const push = (geo, mat4, color, m) => {
      const base = pos.length / 3, p = geo.attributes.position;
      for(let i = 0; i < p.count; i++){
        _v.fromBufferAttribute(p, i).applyMatrix4(mat4).applyMatrix4(N);
        pos.push(_v.x, _v.y, _v.z); col.push(color.r, color.g, color.b); mask.push(m);
      }
      if(geo.index){ const ix = geo.index.array; for(let i = 0; i < ix.length; i++) idx.push(base + ix[i]); }
      else for(let i = 0; i < p.count; i++) idx.push(base + i);
    };
    const tint = (name, color) => {
      const t = spec.tint && spec.tint[name];
      if(!t) return [color, 0];
      return [t.color !== undefined ? _c.set(t.color).clone() : color, t.mask || 0];
    };
    // skinned body
    for(const sm of rig.skinned){
      if(spec.hide && spec.hide.test(sm.name)) continue;
      const g = sm.geometry, p = g.attributes.position;
      const skinnedPos = new Float32Array(p.count * 3);
      for(let i = 0; i < p.count; i++){
        sm.boneTransform(i, _v); _v.applyMatrix4(sm.matrixWorld);
        skinnedPos[i*3] = _v.x; skinnedPos[i*3+1] = _v.y; skinnedPos[i*3+2] = _v.z;
      }
      const tmp = new THREE.BufferGeometry(); tmp.setAttribute('position', new THREE.BufferAttribute(skinnedPos, 3)); tmp.index = g.index;
      const [c, m] = tint(sm.material.name, matColor(sm.material, new THREE.Color()));
      push(tmp, _o.identity(), c, m);
    }
    for(const st of rig.statics){
      if(spec.hide && spec.hide.test(st.name)) continue;
      const [c, m] = tint(st.material.name, matColor(st.material, new THREE.Color()));
      push(st.geometry, st.matrixWorld, c, m);
    }
    // attached props follow their bone
    for(const a of spec.attach || []){
      const bone = rig.bones[a.bone]; if(!bone) continue;
      bone.matrixWorld.decompose(_p, _q, _s);
      const sb = _s.x;
      _e.set(...(a.rot || [0,0,0]));
      _m.compose(_v.set(...(a.pos || [0,0,0])).multiplyScalar(1 / sb), new THREE.Quaternion().setFromEuler(_e), new THREE.Vector3(1,1,1).multiplyScalar((a.scale || 1) / sb));
      const M = new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, _m);
      for(const part of a.parts){
        const t = a.tint && a.tint[part.name];
        const c = t && t.color !== undefined ? new THREE.Color(t.color) : part.color;
        push(part.g, M, c, t ? (t.mask || 0) : 0);
      }
    }
    for(const x of spec.extra || []) push(x.g, x.matrix ? x.matrix(rig.bones) : _o.identity(), x.color, x.mask || 0);
    return { pos, col, mask, idx };
  }

  function toGeometry(f){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(f.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(f.col, 3));
    g.setAttribute('teamMask', new THREE.Float32BufferAttribute(f.mask, 1));
    g.setIndex(f.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  /* Normalisation: model space -> game space (feet on y=0, facing +Z, given height) */
  function normalizer(rig, spec){
    rig.pose(spec.measure || [], spec.poseFn ? b => spec.poseFn(b, 'measure', 0) : null);
    const f = flatten(rig, { hide: spec.measureHide !== undefined ? spec.measureHide : spec.hide, attach:[] }, new THREE.Matrix4());
    const box = new THREE.Box3(), v = new THREE.Vector3();
    for(let i = 0; i < f.pos.length; i += 3) box.expandByPoint(v.set(f.pos[i], f.pos[i+1], f.pos[i+2]));
    const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const s = spec.height / (spec.measureAxis === 'z' ? size.z : size.y);
    const N = new THREE.Matrix4()
      .makeRotationY(spec.rotY || 0)
      .multiply(new THREE.Matrix4().makeScale(s, s, s))
      .multiply(new THREE.Matrix4().makeTranslation(-ctr.x, -box.min.y, -ctr.z));
    return { N, size, s };
  }

  /* Bake every animation of a variant: { key: [geometry per frame] } */
  function bake(rig, spec){
    const { N } = normalizer(rig, spec);
    const out = {};
    for(const [key, a] of Object.entries(spec.anims)){
      out[key] = [];
      for(let f = 0; f < a.frames; f++){
        const u = a.loop ? f / a.frames : (a.frames > 1 ? f / (a.frames - 1) : 0);
        const layers = a.layers.map(L => ({ clip:L.clip, part:L.part, t:(L.at !== undefined ? L.at : u) * rig.duration(L.clip) * (L.span || 1) }));
        rig.pose(layers, spec.poseFn ? b => spec.poseFn(b, key, u) : null);
        out[key].push(toGeometry(flatten(rig, spec, N)));
      }
    }
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

  return { loadAll, staticParts, Rig, bake, boneMap, aim };
})();
