/* Çöp Ordu — the battlefield world: eight lands, each level with its own terrain, sky, plants, castle and weather.
   Everything here is built procedurally and rebuilt when a level starts. */
"use strict";

/* ---------- noise ---------- */
function hash2(x,y){ let h=(Math.imul(x,374761393)+Math.imul(y,668265263))|0; h=Math.imul(h^(h>>>13),1274126177); h^=h>>>16; return (h>>>0)/4294967296; }
function vnoise(x,y){
  const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
  const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
  const a=hash2(xi,yi), b=hash2(xi+1,yi), c=hash2(xi,yi+1), d=hash2(xi+1,yi+1);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
function fbm(x,y){ let s=0,a=.5,f=1; for(let i=0;i<4;i++){ s+=a*vnoise(x*f,y*f); f*=2.03; a*=.5; } return s/.9375; }

/* ---------- the eight lands ---------- */
const LAND = {
  meadow: { sky:[0x4f8ccc,0xd7e4ec], fog:[0xc9d8e3,1500,5600], sun:[0xfff0d4,.95,[-460,760,420]], hemi:[0xe4f0ff,0x5b6b3a,.62],
            ground:[0x4b7a28,0x7ba446], field:[0xa48553,0xd0b886], rock:0x8b8a7d, hills:1, water:'river', waterCol:0x3f9fc0,
            trees:{ pine:.55, oak:.45 }, tuft:0x5f8f32, flowers:true, mtn:0x7c8a98, caps:true, clouds:1,
            castle:{ stone:0xd8d2c4, roof:0x9b3a2c, dome:false }, weather:null },
  desert: { sky:[0x5aa0dc,0xf4e3c2], fog:[0xf0dcb8,1400,5200], sun:[0xfff3d8,1.05,[-300,820,300]], hemi:[0xfff4e0,0xb08a50,.62],
            ground:[0xd2ad6e,0xeccb8f], field:[0xc99b5c,0xe6c38a], rock:0xb8885a, hills:.7, dunes:true, water:'oasis', waterCol:0x2fb5c0,
            trees:{ cactus:.65, palm:.35 }, tuft:0xb39a5a, mtn:0xc99a6a, caps:false, clouds:.35,
            castle:{ stone:0xe6cc98, roof:0xc4703a, dome:true }, weather:'dust' },
  autumn: { sky:[0x6f9ad0,0xf0dcc4], fog:[0xe4d2bc,1300,5000], sun:[0xffe2b8,.95,[-500,640,420]], hemi:[0xffe9d2,0x6a5030,.62],
            ground:[0x7e7a2e,0xb08a3a], field:[0x9c7a4c,0xc8a274], rock:0x8a7d70, hills:1.1, water:'river', waterCol:0x4a8fa8,
            trees:{ autumn:.8, pine:.2 }, tuft:0xa08a3a, mtn:0x8a7f8a, caps:true, clouds:.8,
            castle:{ stone:0xb87a5a, roof:0x5a3a2a, dome:false }, weather:'leaves' },
  snow:   { sky:[0x7fa8d4,0xe9f0f6], fog:[0xe2eaf2,1100,4600], sun:[0xf2f6ff,.9,[-420,700,380]], hemi:[0xf0f6ff,0x9aa8b8,.72],
            ground:[0xe6edf4,0xffffff], field:[0xc9d3dc,0xe8eef3], rock:0x8a96a6, hills:1.5, water:'ice', waterCol:0xbfe0f0,
            trees:{ snowpine:1 }, tuft:null, mtn:0xa8b6c8, caps:true, clouds:.9,
            castle:{ stone:0xc8d6e4, roof:0x3a5a8a, dome:false, snowy:true }, weather:'snow' },
  canyon: { sky:[0x4f8ad0,0xf2cfa4], fog:[0xe8c49c,1400,5200], sun:[0xffe6c4,1,[-380,760,320]], hemi:[0xffecd8,0x8a4a2c,.6],
            ground:[0xa65a34,0xc9783f], field:[0xb7794a,0xd89a64], rock:0x9a4a2c, hills:.4, cliffs:true, water:null,
            trees:{ cactus:.3, dead:.7 }, tuft:0x9a8a4a, mtn:0xb25a34, caps:false, mesas:true, clouds:.4,
            castle:{ stone:0xc98a5a, roof:0x7a2a1a, dome:true }, weather:'dust' },
  swamp:  { sky:[0x6f8a7c,0xbac6b2], fog:[0xa4b49a,700,3200], sun:[0xe8f0d0,.7,[-420,700,420]], hemi:[0xd8e4cc,0x3a4a2a,.66],
            ground:[0x3e5a2c,0x5a7240], field:[0x5e5638,0x7c6e48], rock:0x5a5e50, hills:.35, water:'bog', waterCol:0x4a6a3a,
            trees:{ dead:.45, willow:.55 }, tuft:0x4f6a30, mushrooms:true, mtn:0x5a6a5a, caps:false, clouds:.6,
            castle:{ stone:0x7c8a6a, roof:0x3a4a2a, dome:false, moss:true }, weather:'fireflies' },
  volcano:{ sky:[0x2a1a1c,0xc4683a], fog:[0x5a3428,1000,4400], sun:[0xffb07a,.95,[-380,560,380]], hemi:[0xffb08a,0x3a2a20,.72],
            ground:[0x3a3230,0x584a40], field:[0x5c4a3e,0x7e6652], rock:0x2a2624, hills:1.3, water:'lava', waterCol:0xff5a1a,
            trees:{ burnt:1 }, tuft:null, mtn:0x3a2c28, caps:false, volcanoes:true, clouds:0,
            castle:{ stone:0x3c3432, roof:0x7a1a10, dome:false, glow:0xff6a2a }, weather:'embers' },
  night:  { sky:[0x081430,0x2c4068], fog:[0x1c2842,1200,4800], sun:[0xb4c6ff,.72,[-420,720,380]], hemi:[0x8aa0d8,0x1c2622,.58],
            ground:[0x2c4a2a,0x40623a], field:[0x5a4c38,0x7a6a50], rock:0x5a5c66, hills:1, water:'river', waterCol:0x22406a,
            trees:{ pine:.6, oak:.4 }, tuft:0x2e5030, mtn:0x2a3448, caps:true, clouds:0, stars:true, torches:true,
            castle:{ stone:0x6a6a74, roof:0x2a2a4a, dome:false, glow:0xffc46a }, weather:'fireflies' },
};

/* ---------- terrain shape ---------- */
const WORLD = { group:null, land:'meadow', L:LAND.meadow, seed:1, river:null, update:null, particles:null, t:0 };
const FLAT = () => ({ x0:-W/2-70, x1:W/2+70, z0:-H/2-300, z1:H/2+120 });
function terrainH(X, Z){
  const L = WORLD.L, F = FLAT(), sd = WORLD.seed*13.7;
  const dx = Math.max(0, F.x0-X, X-F.x1), dz = Math.max(0, F.z0-Z, Z-F.z1);
  const d = Math.hypot(dx, dz);
  let h = 0;
  if(d > 0){
    const s = Math.min(1, d/170), sm = s*s*(3-2*s);
    h = sm*(22+fbm(X*.004+sd, Z*.004)*120)*L.hills + Math.max(0, d-170)*.2*(.5+fbm(X*.002+5+sd, Z*.002)*.9)*L.hills;
    if(L.dunes) h += sm*Math.sin(X*.012 + Z*.004 + sd)*26*(.6+fbm(X*.003, Z*.003));
    if(L.cliffs && dx > 0) h += Math.min(1, dx/60)*180 + fbm(X*.01, Z*.01)*30;            // canyon walls along both flanks
    if(L.volcanoes) h += Math.pow(fbm(X*.003+sd, Z*.003), 3)*260*sm;
  }
  // a stream or lava channel crossing the land (never through the deployment zones)
  const R = WORLD.river;
  if(R){
    const zc = R.z + Math.sin(X*R.f + R.p)*R.a, w = R.w, dd = Math.abs(Z - zc);
    if(dd < w){ const k = 1 - dd/w; h -= k*k*R.depth; }
  }
  return h;
}

/* ---------- small helpers ---------- */
const wcol = h => new THREE.Color(h);
function addTo(obj){ WORLD.group.add(obj); return obj; }
/* a kit of instanced parts: add(geometryKey, matrix, colour) many times, then flush() */
function Kit(material, shadow){
  const parts = new Map();
  return {
    add(key, geo, m, c){ if(!parts.has(key)) parts.set(key, { geo, list:[] }); parts.get(key).list.push([m.clone(), c.clone ? c.clone() : wcol(c)]); },
    flush(){
      for(const { geo, list } of parts.values()){
        const im = new THREE.InstancedMesh(geo, material, list.length);
        list.forEach(([m, c], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c); });
        im.castShadow = shadow; im.receiveShadow = true; addTo(im);
      }
    },
  };
}
const _wm = new THREE.Matrix4(), _wq = new THREE.Quaternion(), _we = new THREE.Euler(), _wp = new THREE.Vector3(), _ws = new THREE.Vector3();
const mat4 = (x,y,z, ry, sx,sy,sz, rx=0, rz=0) => _wm.compose(_wp.set(x,y,z), _wq.setFromEuler(_we.set(rx,ry,rz)), _ws.set(sx,sy,sz));

/* where scenery may go: keep the field, the camera's side and the castle grounds clear */
function placeOK(X, Z, pad){
  if(Math.abs(X) < W/2+pad && Math.abs(Z) < H/2+pad) return false;
  if(X > W/2-40 && X < W/2+900 && Math.abs(Z) < H/2+260) return false;   // landscape camera looks in from +X
  if(Math.abs(X) < 460 && Z > H/2-40 && Z < 1500) return false;            // portrait camera looks in from +Z
  if(Math.abs(X) < 420 && Z < -H/2+40 && Z > -H/2-480) return false;       // castle grounds
  const R = WORLD.river;
  if(R && Math.abs(Z - (R.z + Math.sin(X*R.f + R.p)*R.a)) < R.w + 8) return false;
  return true;
}

/* ---------- build ---------- */
const GEOS = {};
function geos(){
  if(GEOS.cone) return GEOS;
  GEOS.cone = new THREE.ConeGeometry(1,1,8); GEOS.cone.translate(0,.5,0);
  GEOS.trunk = new THREE.CylinderGeometry(.75,1,1,7); GEOS.trunk.translate(0,.5,0);
  GEOS.blob = new THREE.IcosahedronGeometry(1,1);
  GEOS.rock = new THREE.DodecahedronGeometry(1,0);
  GEOS.leaf = new THREE.ConeGeometry(.35,1,4); GEOS.leaf.rotateX(Math.PI/2); GEOS.leaf.translate(0,0,.5);
  GEOS.tuft = (() => {      // three crossed blades
    const parts = [0,1,2].map(i => { const g = new THREE.ConeGeometry(.12,1,3); g.translate(0,.5,0); g.rotateZ((i-1)*.35); g.rotateY(i*2.1); return g; });
    return mergeGeos(parts);
  })();
  GEOS.flower = new THREE.IcosahedronGeometry(1,0);
  GEOS.cyl = new THREE.CylinderGeometry(1,1,1,10); GEOS.cyl.translate(0,.5,0);
  return GEOS;
}
function mergeGeos(list){
  let n = 0; const pos = [], nor = [], idx = [];
  for(const g of list){
    const p = g.attributes.position.array, q = g.attributes.normal.array;
    for(let i=0;i<p.length;i++){ pos.push(p[i]); nor.push(q[i]); }
    if(g.index) for(const i of g.index.array) idx.push(n+i); else for(let i=0;i<g.attributes.position.count;i++) idx.push(n+i);
    n += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor,3)); g.setIndex(idx);
  return g;
}

function disposeWorld(){
  if(!WORLD.group) return;
  scene.remove(WORLD.group);
  WORLD.group.traverse(o => {
    if(o.geometry && !Object.values(GEOS).includes(o.geometry)) o.geometry.dispose();
    if(o.material){ (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if(m.map) m.map.dispose(); m.dispose(); }); }
  });
  WORLD.group = null; banners.length = 0;
}

function buildWorld(land, seed){
  disposeWorld();
  const L = LAND[land] || LAND.meadow;
  WORLD.land = land; WORLD.L = L; WORLD.seed = seed;
  const rnd = mulberry32(seed*977 + 31);
  // some lands cross the no-man's-land with water (a ford the armies wade through); lava only flows outside
  WORLD.river = null;
  if(L.water==='river' || L.water==='bog' || L.water==='ice'){ if(rnd() < .7) WORLD.river = { z:(rnd()-.5)*60, a:18+rnd()*20, f:.006+rnd()*.006, p:rnd()*6, w:L.water==='bog'?60:34, depth:L.water==='ice'?3:6 }; }
  if(L.water==='lava') WORLD.river = { z:-H/2-520-rnd()*120, a:60, f:.004, p:rnd()*6, w:70, depth:14 };
  WORLD.group = new THREE.Group(); scene.add(WORLD.group);
  scene.fog = new THREE.Fog(L.fog[0], L.fog[1], L.fog[2]);
  const mobile = Math.min(innerWidth, innerHeight) < 700;
  geos();
  buildSky(L, rnd);
  buildLights(L, mobile);
  buildTerrain(L, rnd);
  buildWater(L);
  buildPlants(L, rnd);
  buildRocks(L, rnd);
  buildMountains(L, rnd);
  buildCastle(L);
  buildCamp(L);
  buildWeather(L, rnd);
}

function buildSky(L, rnd){
  const R = 7000, g = new THREE.SphereGeometry(R,32,16), p = g.attributes.position, cs = [];
  const top = wcol(L.sky[0]), hor = wcol(L.sky[1]), t = new THREE.Color();
  for(let i=0;i<p.count;i++){ const k = clamp((p.getY(i)/R+.03)/.55, 0, 1); t.copy(hor).lerp(top, Math.pow(k,.75)); cs.push(t.r,t.g,t.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cs,3));
  addTo(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.BackSide, fog:false, depthWrite:false })));
  // sun or moon disc with a soft halo
  const dir = new THREE.Vector3(...L.sun[2]).normalize();
  const halo = canvasTex(128, (x,s) => { const gr = x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.18,'rgba(255,255,255,.95)'); gr.addColorStop(.3,'rgba(255,255,255,.35)'); gr.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=gr; x.fillRect(0,0,s,s); });
  halo.wrapS = halo.wrapT = THREE.ClampToEdgeWrapping;
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map:halo, color:L.stars ? 0xdfe8ff : L.sun[0], fog:false, depthWrite:false, transparent:true }));
  sun.position.copy(dir.multiplyScalar(6000)); sun.scale.setScalar(L.stars ? 700 : 1100); addTo(sun);
  if(L.stars){
    const n = 900, pos = new Float32Array(n*3);
    for(let i=0;i<n;i++){ const a = rnd()*TAU, e = .08 + rnd()*1.3, r = 6500; pos[i*3]=Math.cos(a)*Math.cos(e)*r; pos[i*3+1]=Math.sin(e)*r; pos[i*3+2]=Math.sin(a)*Math.cos(e)*r; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos,3));
    addTo(new THREE.Points(sg, new THREE.PointsMaterial({ color:0xffffff, size:14, sizeAttenuation:true, fog:false })));
  }
  // drifting clouds: clusters of flattened blobs
  const nClouds = Math.round(26*L.clouds);
  if(nClouds){
    const kit = Kit(new THREE.MeshLambertMaterial({ color:0xffffff, fog:false, transparent:true, opacity:.9 }), false);
    for(let i=0;i<nClouds;i++){
      const a = rnd()*TAU, r = 1800+rnd()*2600, y = 900+rnd()*700, s = 120+rnd()*180;
      for(let j=0;j<5;j++) kit.add('cloud', GEOS.blob, mat4(Math.cos(a)*r+(j-2)*s*.7, y+(rnd()-.5)*40, Math.sin(a)*r+(rnd()-.5)*s*.6, rnd()*3, s*(.8+rnd()*.5), s*.38, s*(.7+rnd()*.4)), wcol(L.stars ? 0x8090a8 : 0xffffff));
    }
    kit.flush();
  }
}

let SUN = null;
function buildLights(L, mobile){
  addTo(new THREE.HemisphereLight(L.hemi[0], L.hemi[1], L.hemi[2]));
  SUN = new THREE.DirectionalLight(L.sun[0], L.sun[1]);
  SUN.position.set(...L.sun[2]); SUN.target.position.set(0,0,-40);
  SUN.castShadow = true;
  SUN.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(SUN.shadow.camera, { left:-760, right:760, top:760, bottom:-760, near:100, far:2800 });
  SUN.shadow.bias = -.0006; SUN.shadow.normalBias = .8;
  addTo(SUN); addTo(SUN.target);
}

function buildTerrain(L, rnd){
  const SIZE = 5200, SEG = 260;
  const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); g.rotateX(-Math.PI/2);
  const p = g.attributes.position, cs = new Float32Array(p.count*3);
  const c1 = new THREE.Color(), c2 = new THREE.Color(), G0 = wcol(L.ground[0]), G1 = wcol(L.ground[1]), F0 = wcol(L.field[0]), F1 = wcol(L.field[1]), RK = wcol(L.rock);
  const sd = WORLD.seed*3.1;
  for(let i=0;i<p.count;i++){
    const X = p.getX(i), Z = p.getZ(i), h = terrainH(X, Z);
    p.setY(i, h);
    const n = fbm(X*.018+sd, Z*.018), n2 = fbm(X*.005+11, Z*.005-7+sd);
    c1.copy(G0).lerp(G1, clamp(n2*.9+n*.25, 0, 1));
    const edge = Math.max(Math.abs(X)-(W/2+18), Math.abs(Z)-(H/2+18)) + (n-.5)*50;
    let dirt = edge < 0 ? 1 : Math.max(0, 1-edge/36);
    if(Z < -H/2+10 && Z > -H/2-300 && Math.abs(X) < 30+(n-.5)*16) dirt = Math.max(dirt, .95);      // road to the gate
    if(dirt > 0){ c2.copy(F0).lerp(F1, n); if(dirt >= 1 && n2 > .62) c2.lerp(G0, (n2-.62)*1.2); c1.lerp(c2, Math.min(1, dirt)); }
    if(h > 120 || (L.cliffs && h > 60)) c1.lerp(RK, Math.min(1, (h-(L.cliffs?60:120))/150));
    if(L.caps && h > 330) c1.lerp(wcol(0xf4f7fa), Math.min(1, (h-330)/80));
    if(WORLD.river && h < -1){ c1.lerp(wcol(L.water==='lava' ? 0x2a1610 : 0x5a4a34), Math.min(1, -h/4)); }
    cs[i*3] = c1.r; cs[i*3+1] = c1.g; cs[i*3+2] = c1.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cs,3)); g.computeVertexNormals();
  const grain = canvasTex(256, (x,s) => {
    const img = x.createImageData(s,s);
    for(let i=0;i<s*s;i++){ const v = 205+Math.random()*50; img.data[i*4]=v; img.data[i*4+1]=v; img.data[i*4+2]=v; img.data[i*4+3]=255; }
    x.putImageData(img,0,0);
    for(let i=0;i<1800;i++){ const px=Math.random()*s, py=Math.random()*s; x.strokeStyle=`rgba(30,40,20,${Math.random()*.16})`; x.lineWidth=1; x.beginPath(); x.moveTo(px,py); x.lineTo(px+(Math.random()-.5)*3,py-2-Math.random()*4); x.stroke(); }
  });
  grain.repeat.set(110,110);
  const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors:true, map:grain }));
  ground.receiveShadow = true; addTo(ground);
}

/* water, ice, bog or lava along the river course; animated in updateWorld */
function buildWater(L){
  const R = WORLD.river; if(!R) return;
  const pts = [], n = 90, len = 5000;
  const pos = [], uv = [], idx = [];
  for(let i=0;i<=n;i++){
    const X = -len/2 + i*len/n, zc = R.z + Math.sin(X*R.f + R.p)*R.a;
    const y = L.water==='lava' ? -R.depth*.55 : L.water==='ice' ? -.6 : -1.2;
    pos.push(X, y, zc-R.w*.92, X, y, zc+R.w*.92); uv.push(i/6, 0, i/6, 1);
    if(i<n){ const a=i*2; idx.push(a,a+1,a+2, a+1,a+3,a+2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals();
  let m;
  if(L.water==='lava'){
    const tex = canvasTex(128, (x,s) => { const img=x.createImageData(s,s); for(let yy=0;yy<s;yy++) for(let xx=0;xx<s;xx++){ const v=fbm(xx*.08,yy*.08); const i=(yy*s+xx)*4; img.data[i]=255; img.data[i+1]=80+v*150; img.data[i+2]=20+v*40; img.data[i+3]=255; } x.putImageData(img,0,0); });
    m = new THREE.MeshBasicMaterial({ map:tex, color:0xffffff });
  } else if(L.water==='ice'){
    m = new THREE.MeshPhongMaterial({ color:L.waterCol, shininess:120, specular:0xffffff, transparent:true, opacity:.92 });
  } else {
    const tex = canvasTex(128, (x,s) => { const img=x.createImageData(s,s); for(let yy=0;yy<s;yy++) for(let xx=0;xx<s;xx++){ const v=fbm(xx*.1,yy*.1); const i=(yy*s+xx)*4; const k=200+v*55; img.data[i]=k; img.data[i+1]=k; img.data[i+2]=k; img.data[i+3]=255; } x.putImageData(img,0,0); });
    m = new THREE.MeshPhongMaterial({ color:L.waterCol, map:tex, shininess:L.water==='bog'?20:90, specular:L.water==='bog'?0x334422:0xbfe9ff, transparent:true, opacity:L.water==='bog'?.9:.82 });
  }
  const water = addTo(new THREE.Mesh(g, m)); water.receiveShadow = L.water!=='lava';
  WORLD.water = { mesh:water, map:m.map };
  if(L.water==='lava'){ const glow = new THREE.PointLight(0xff6a2a, 1.4, 900); glow.position.set(0, 60, R.z); addTo(glow); }
}

/* trees and smaller plants, all instanced */
function buildPlants(L, rnd){
  const kit = Kit(new THREE.MeshLambertMaterial({ color:0xffffff }), true);
  const plants = Object.entries(L.trees);
  const pickType = () => { let x = rnd(); for(const [t, w] of plants){ x -= w; if(x <= 0) return t; } return plants[0][0]; };
  const N = L.trees.cactus || L.trees.dead ? 340 : 560;
  let placed = 0, tries = 0;
  while(placed < N && tries < 24000){
    tries++;
    const near = rnd() < .45;
    const X = near ? (rnd()<.5?-1:1)*(W/2+40+rnd()*320) : (rnd()*2-1)*2100;
    const Z = near ? (rnd()*2-1)*(H/2+240) : (rnd()*2-1)*2100-150;
    if(!placeOK(X, Z, 34)) continue;
    const h = terrainH(X, Z); if(h > 420 || h < -2) continue;
    const k = 1 + rnd()*1.7, y = h - 1, ry = rnd()*TAU, v = .85 + rnd()*.3;
    tree(kit, pickType(), X, y, Z, k, ry, v, rnd);
    placed++;
  }
  // grass tufts and flowers around the field
  if(L.tuft){
    const tc = wcol(L.tuft);
    for(let i=0;i<2600;i++){
      const X = (rnd()*2-1)*(W/2+700), Z = (rnd()*2-1)*(H/2+700);
      if(Math.abs(X) < W/2+12 && Math.abs(Z) < H/2+12) continue;
      if(!placeOK(X, Z, 6) && rnd() < .8) continue;
      const h = terrainH(X, Z); if(h < -1) continue;
      const s = 3 + rnd()*4;
      kit.add('tuft', GEOS.tuft, mat4(X, h, Z, rnd()*TAU, s, s*(1.2+rnd()), s), tc.clone().multiplyScalar(.8 + rnd()*.4));
    }
  }
  if(L.flowers){
    const fc = [0xf2e14a, 0xffffff, 0xe0568a, 0x9a6ad8].map(wcol);
    for(let i=0;i<700;i++){
      const X = (rnd()*2-1)*(W/2+600), Z = (rnd()*2-1)*(H/2+600);
      if(Math.abs(X) < W/2+20 && Math.abs(Z) < H/2+20) continue;
      const h = terrainH(X, Z); if(h < -1) continue;
      kit.add('flower', GEOS.flower, mat4(X, h+1.2, Z, 0, 1.1, 1.1, 1.1), fc[Math.floor(rnd()*fc.length)]);
    }
  }
  if(L.mushrooms){
    for(let i=0;i<160;i++){
      const X = (rnd()*2-1)*(W/2+500), Z = (rnd()*2-1)*(H/2+500);
      if(!placeOK(X, Z, 14)) continue;
      const h = terrainH(X, Z), s = 2 + rnd()*4;
      kit.add('trunk', GEOS.trunk, mat4(X, h, Z, 0, s*.3, s*1.2, s*.3), wcol(0xe8e0cc));
      kit.add('cap', GEOS.blob, mat4(X, h+s*1.25, Z, 0, s, s*.45, s), wcol(rnd()<.5 ? 0xc0382a : 0xa86ad0));
    }
  }
  kit.flush();
}
function tree(kit, type, X, y, Z, k, ry, v, rnd){
  const G = GEOS, C = (h) => wcol(h).multiplyScalar(v);
  switch(type){
    case 'pine': case 'snowpine': {
      kit.add('trunk', G.trunk, mat4(X,y,Z, ry, k, 8*k, k), wcol(0x5e4127));
      [[8.5,14,5.5],[6.8,12,11],[4.8,10,16.5]].forEach(([r,h,yy],j) => {
        kit.add('cone', G.cone, mat4(X, y+yy*k, Z, ry, r*k, h*k, r*k), C(type==='snowpine' ? 0x2f5a3a : [0x2f5a2a,0x3a6b2f,0x264d24][j]));
        if(type==='snowpine') kit.add('cone', G.cone, mat4(X, y+yy*k+h*k*.45, Z, ry, r*k*.62, h*k*.55, r*k*.62), wcol(0xf4f8fb));
      });
      break;
    }
    case 'oak': case 'autumn': case 'willow': {
      kit.add('trunk', G.trunk, mat4(X,y,Z, ry, 1.4*k, 11*k, 1.4*k), wcol(0x5a3e26));
      const leaves = type==='autumn' ? [0xd8732a,0xe0a63a,0xb8412a,0xc89a2a][Math.floor(rnd()*4)] : type==='willow' ? 0x5a7a3a : [0x3f7a2c,0x4c8a34][Math.floor(rnd()*2)];
      for(let j=0;j<4;j++){
        const a = j/4*TAU + ry, rr = j===0 ? 0 : 4*k;
        kit.add('blob', G.blob, mat4(X+Math.cos(a)*rr, y+(13+ (j===0?4:0))*k, Z+Math.sin(a)*rr, ry, 7*k, (type==='willow'?8:5.5)*k, 7*k), C(leaves));
      }
      break;
    }
    case 'palm': {
      let px = X, py = y; const lean = (rnd()-.5)*.5;
      for(let j=0;j<5;j++){ kit.add('trunk', G.trunk, mat4(px, py, Z, ry, 1*k, 4.2*k, 1*k, 0, lean*j*.25), wcol(0x8a6a44)); px += Math.sin(-lean*j*.25)*4.2*k; py += Math.cos(lean*j*.25)*4.2*k; }
      for(let j=0;j<7;j++) kit.add('leaf', G.leaf, mat4(px, py, Z, j/7*TAU, 2.2*k, 1, 11*k, .5), C(0x4a8a3a));
      break;
    }
    case 'cactus': {
      kit.add('cyl', G.cyl, mat4(X,y,Z, ry, 1.6*k, 14*k, 1.6*k), C(0x4f8a4a));
      for(const sgn of [-1,1]) if(rnd() < .8){
        const ah = (5+rnd()*4)*k;
        kit.add('cyl', G.cyl, mat4(X+sgn*Math.cos(ry)*3.2*k, y+ah, Z-sgn*Math.sin(ry)*3.2*k, ry, 1.1*k, 5*k, 1.1*k), C(0x4f8a4a));
      }
      break;
    }
    case 'dead': case 'burnt': {
      const c = type==='burnt' ? wcol(0x1e1a18) : wcol(0x6a5a48);
      kit.add('trunk', G.trunk, mat4(X,y,Z, ry, 1.2*k, 12*k, 1.2*k), c);
      for(let j=0;j<3;j++) kit.add('trunk', G.trunk, mat4(X, y+(6+j*2.4)*k, Z, ry+j*2.1, .45*k, 6*k, .45*k, .9, 0), c);
      if(type==='burnt' && rnd() < .3) kit.add('blob', G.blob, mat4(X, y+2, Z, 0, 2, 1, 2), wcol(0xff5a1a));
      break;
    }
  }
}

function buildRocks(L, rnd){
  const kit = Kit(new THREE.MeshPhongMaterial({ color:0xffffff, flatShading:true, shininess:4 }), true);
  const base = wcol(L.rock);
  for(let i=0;i<220;i++){
    const edge = rnd() < .55;
    const X = edge ? (rnd()<.5?-1:1)*(W/2+26+rnd()*110) : (rnd()*2-1)*1800;
    const Z = edge ? (rnd()*2-1)*(H/2+80) : (rnd()*2-1)*1800;
    if(!placeOK(X, Z, 20)) continue;
    const k = edge ? 3+rnd()*9 : 6+rnd()*24;
    kit.add('rock', GEOS.rock, mat4(X, terrainH(X,Z)-k*.25, Z, rnd()*3, k*(1+rnd()*.6), k*(.6+rnd()*.5), k*(1+rnd()*.5), rnd()*3, rnd()*3), base.clone().multiplyScalar(.8+rnd()*.35));
  }
  if(L.water==='lava'){
    for(let i=0;i<40;i++){
      const X = (rnd()*2-1)*1500, Z = (rnd()*2-1)*1500; if(!placeOK(X, Z, 30)) continue;
      kit.add('glow', GEOS.rock, mat4(X, terrainH(X,Z), Z, rnd()*3, 4+rnd()*6, 2+rnd()*3, 4+rnd()*6), wcol(0xff6a1a));
    }
  }
  kit.flush();
}

function buildMountains(L, rnd){
  const rockM = new THREE.MeshPhongMaterial({ color:L.mtn, flatShading:true, shininess:0 });
  const snowM = new THREE.MeshPhongMaterial({ color:0xf2f5f8, flatShading:true, shininess:0 });
  const lavaM = new THREE.MeshBasicMaterial({ color:0xff6a2a });
  for(let i=0;i<22;i++){
    const a = i/22*TAU + rnd()*.2, R = 2900+rnd()*900, h = (L.mesas ? 380 : 650)+rnd()*800, r = 520+rnd()*420;
    const X = Math.sin(a)*R, Z = Math.cos(a)*R-200;
    if(L.mesas){
      const g = new THREE.CylinderGeometry(r*.55, r*.7, 1, 7, 3); g.translate(0,.5,0);
      const mt = addTo(new THREE.Mesh(g, rockM)); mt.position.set(X,-20,Z); mt.scale.set(1,h*.7,1); mt.rotation.y = rnd()*TAU;
      continue;
    }
    const g = new THREE.ConeGeometry(1,1,7+Math.floor(rnd()*3),3); g.translate(0,.5,0);
    const p = g.attributes.position;
    for(let j=0;j<p.count;j++){ const y = p.getY(j); if(y>.05 && y<.95){ p.setX(j,p.getX(j)*(.8+rnd()*.4)); p.setZ(j,p.getZ(j)*(.8+rnd()*.4)); p.setY(j,y+(rnd()-.5)*.08); } }
    g.computeVertexNormals();
    const mt = addTo(new THREE.Mesh(g, rockM)); mt.position.set(X,-20,Z); mt.scale.set(r,h,r); mt.rotation.y = rnd()*TAU;
    if(L.caps){ const cap = addTo(new THREE.Mesh(g, snowM)); cap.position.set(X,-20+h*.7,Z); cap.scale.set(r*.31,h*.3,r*.31); cap.rotation.y = mt.rotation.y; }
    if(L.volcanoes && i%5===0){ const crater = addTo(new THREE.Mesh(new THREE.CylinderGeometry(r*.12, r*.16, 30, 10), lavaM)); crater.position.set(X, -20+h*.93, Z); }
  }
}

function brickTexture(){
  return canvasTex(256,(x,s)=>{
    x.fillStyle='#8a8478'; x.fillRect(0,0,s,s);
    const bh=16, bw=40;
    for(let row=0;row<s/bh;row++) for(let c=-1;c<s/bw+1;c++){
      const ox=(row%2)*bw/2, v=150+Math.random()*45;
      x.fillStyle=`rgb(${v},${v-4},${v-12})`; x.fillRect(c*bw+ox+1.5,row*bh+1.5,bw-3,bh-3);
    }
  });
}
function buildCastle(L){
  const S = L.castle, tex = brickTexture(); tex.repeat.set(6,2);
  const stone = new THREE.MeshLambertMaterial({ color:S.stone, map:tex });
  const roof = new THREE.MeshLambertMaterial({ color:S.roof });
  const dark = new THREE.MeshLambertMaterial({ color:0x2a221d });
  const glowM = S.glow ? new THREE.MeshBasicMaterial({ color:S.glow }) : dark;
  const z0 = -H/2-140, half = W/2+40;
  const add = (geo, m, x, y, z, ry=0) => { const o = addTo(new THREE.Mesh(geo, m)); o.position.set(x,y,z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; return o; };
  add(new THREE.BoxGeometry(half*2,70,24), stone, 0, 35, z0);
  const cren = new THREE.InstancedMesh(new THREE.BoxGeometry(9,10,26), stone, 60), m = new THREE.Matrix4(); let n = 0;
  for(let x=-half+10; x<=half-10; x+=16){ if(Math.abs(x) < 44) continue; m.makeTranslation(x, 75, z0); cren.setMatrixAt(n++, m); }
  cren.count = n; cren.castShadow = true; addTo(cren);
  add(new THREE.BoxGeometry(52,48,4), dark, 0, 24, z0+12.5);
  const arch = new THREE.CylinderGeometry(26,26,4,16,1,false,0,Math.PI); arch.rotateX(Math.PI/2); arch.rotateZ(Math.PI/2); add(arch, dark, 0, 48, z0+12.5);
  const towerRoof = (x, y, z, r, h) => S.dome ? add(new THREE.SphereGeometry(r*.95, 14, 8, 0, TAU, 0, Math.PI/2), roof, x, y-h*.42, z) : add(new THREE.ConeGeometry(r, h, 14), roof, x, y, z);
  for(const x of [-half, half]){ add(new THREE.CylinderGeometry(36,40,130,14), stone, x, 65, z0); towerRoof(x, 163, z0, 45, 66); banner(x, 196, z0, 0xc9352a); }
  for(const x of [-66, 66]){ add(new THREE.CylinderGeometry(26,28,104,12), stone, x, 52, z0+4); towerRoof(x, 130, z0+4, 33, 48); banner(x, 154, z0+4, 0xc9352a); }
  add(new THREE.BoxGeometry(180,160,110), stone, 0, 80, z0-110);
  if(S.dome) add(new THREE.SphereGeometry(70, 18, 10, 0, TAU, 0, Math.PI/2), roof, 0, 160, z0-110);
  else { const kr = add(new THREE.ConeGeometry(134,84,4), roof, 0, 202, z0-110); kr.rotation.y = Math.PI/4; }
  banner(0, S.dome ? 236 : 262, z0-110, 0xc9352a);
  for(const x of [-56,0,56]) add(new THREE.BoxGeometry(11,20,2), glowM, x, 108, z0-54);
  if(S.snowy){ const snowM = new THREE.MeshLambertMaterial({ color:0xf6f9fc }); add(new THREE.BoxGeometry(half*2+4,4,28), snowM, 0, 72, z0); }
  if(S.glow){ const l = new THREE.PointLight(S.glow, 1.1, 520); l.position.set(0, 120, z0-20); addTo(l); }
}
function banner(x, y, z, color){
  const pole = addTo(new THREE.Mesh(new THREE.CylinderGeometry(.9,.9,34,5), new THREE.MeshLambertMaterial({ color:0x4a3a2a })));
  pole.position.set(x, y, z);
  const g = new THREE.PlaneGeometry(18,11,6,1); g.translate(9,0,0);
  const flag = addTo(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side:THREE.DoubleSide })));
  flag.position.set(x+.8, y+10, z); flag.castShadow = true;
  banners.push({ mesh:flag, base:g.attributes.position.array.slice(), ph:Math.random()*TAU });
}
function buildCamp(L){
  const blue = new THREE.MeshLambertMaterial({ color:0x2f62d8 }), cream = new THREE.MeshLambertMaterial({ color:0xe8e2d4 });
  const z = H/2+60;
  [[-300,z+20],[-230,z+50],[230,z+50],[300,z+20],[-160,z+80],[160,z+80]].forEach(([x,zz],i) => {
    const t = addTo(new THREE.Mesh(new THREE.ConeGeometry(18,25,4), i%2 ? blue : cream));
    t.position.set(x, 12.5+terrainH(x,zz), zz); t.rotation.y = Math.PI/4+i*.2; t.castShadow = t.receiveShadow = true;
  });
  for(const x of [-110,110]) banner(x, 17, z-10, 0x2f62d8);
  // campfire, with light at night
  const fire = addTo(new THREE.Mesh(new THREE.ConeGeometry(4,9,6), new THREE.MeshBasicMaterial({ color:0xffa040 }))); fire.position.set(0, 4.5, z+60);
  WORLD.fire = fire;
  if(L.torches){
    const l = new THREE.PointLight(0xffa850, 1.6, 420); l.position.set(0, 30, z+60); addTo(l);
    for(const x of [-W/2-30, W/2+30]) for(const zz of [-H/4, H/4]){
      const post = addTo(new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.4,26,6), new THREE.MeshLambertMaterial({ color:0x4a3a2a }))); post.position.set(x, 13, zz);
      const fl = addTo(new THREE.Mesh(new THREE.ConeGeometry(2.6,6,6), new THREE.MeshBasicMaterial({ color:0xffb050 }))); fl.position.set(x, 29, zz);
      const tl = new THREE.PointLight(0xffa850, 1.1, 300); tl.position.set(x, 34, zz); addTo(tl);
    }
  }
}

/* falling snow, drifting dust, rising embers, blinking fireflies, falling leaves */
function buildWeather(L, rnd){
  WORLD.particles = null;
  const kind = L.weather; if(!kind) return;
  const n = { snow:1400, dust:500, embers:600, fireflies:260, leaves:300 }[kind];
  const pos = new Float32Array(n*3), seed = new Float32Array(n);
  for(let i=0;i<n;i++){ pos[i*3]=(rnd()*2-1)*900; pos[i*3+1]=rnd()*320; pos[i*3+2]=(rnd()*2-1)*900; seed[i]=rnd()*100; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  const dot = canvasTex(32, (x,s) => { const gr = x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.4,'rgba(255,255,255,.8)'); gr.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=gr; x.fillRect(0,0,s,s); });
  dot.wrapS = dot.wrapT = THREE.ClampToEdgeWrapping;
  const color = { snow:0xffffff, dust:0xe8d2a4, embers:0xff7a2a, fireflies:0xd8ff7a, leaves:0xd8822a }[kind];
  const size = { snow:3.2, dust:2.6, embers:3, fireflies:3.4, leaves:3.6 }[kind];
  const pts = addTo(new THREE.Points(g, new THREE.PointsMaterial({ color, size, map:dot, transparent:true, depthWrite:false, opacity:kind==='dust'?.5:.95, blending:(kind==='embers'||kind==='fireflies') ? THREE.AdditiveBlending : THREE.NormalBlending })));
  WORLD.particles = { kind, pts, pos, seed, n };
}

/* per-frame life: water flows, weather moves, the campfire flickers */
function updateWorld(dt, time){
  if(WORLD.water && WORLD.water.map){ WORLD.water.map.offset.x += dt*(WORLD.land==='volcano' ? .02 : .05); }
  if(WORLD.fire){ const k = 1 + Math.sin(time*13)*.12 + Math.sin(time*7.3)*.08; WORLD.fire.scale.set(k, k*(1+Math.sin(time*9)*.1), k); }
  const P = WORLD.particles; if(!P) return;
  const p = P.pos;
  for(let i=0;i<P.n;i++){
    const s = P.seed[i], k = i*3;
    switch(P.kind){
      case 'snow':   p[k+1] -= dt*(18+s%10); p[k] += Math.sin(time+s)*dt*8; if(p[k+1] < 0) p[k+1] = 320; break;
      case 'leaves': p[k+1] -= dt*(10+s%6); p[k] += Math.sin(time*1.5+s)*dt*16; p[k+2] += dt*6; if(p[k+1] < 0) p[k+1] = 240; break;
      case 'dust':   p[k] += dt*(30+s%20); p[k+1] = 4 + (Math.sin(time*.7+s)+1)*30; if(p[k] > 900) p[k] = -900; break;
      case 'embers': p[k+1] += dt*(14+s%12); p[k] += Math.sin(time*2+s)*dt*6; if(p[k+1] > 320) p[k+1] = 0; break;
      case 'fireflies': p[k] += Math.sin(time*.8+s)*dt*10; p[k+2] += Math.cos(time*.7+s*1.3)*dt*10; p[k+1] = 6 + (Math.sin(time*.5+s)+1)*22; break;
    }
  }
  P.pts.geometry.attributes.position.needsUpdate = true;
  if(P.kind==='fireflies') P.pts.material.opacity = .65 + Math.sin(time*3)*.3;
}
