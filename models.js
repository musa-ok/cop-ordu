/* Çöp Ordu — 3D unit models.
   Characters: KayKit Adventurers by Kay Lousberg (CC0). Horse and tank: Quaternius (CC0).
   Every animation is baked into frame meshes; each frame is one InstancedMesh, with a detailed (LOD0)
   and a simplified (LOD1) version so a whole army costs a few dozen draw calls. */
"use strict";
const MODEL = { ready:false, failed:false, V:{}, meshes:[], pivot:null, team:null, dead:null };
const MODEL_FILES = {
  knight:'models/kk_knight.glb', rogue:'models/kk_rogue.glb', barbarian:'models/kk_barbarian.glb',
  horse:'models/horse.glb', tank:'models/tank.glb',
};
const MODEL_CAPS = { soldier:1600, archer:1100, rider:550, horse:550, giant:200, commander:4, tankBody:200, tankTurret:200, tankGun:200 };
const TANK_H = 21;                    // a tank stands well above a soldier (15)
const RIDER_OFFSET = [0, 6.4, 1.6];
const LOD_DIST = 260;                 // beyond this distance from the camera, units use the simplified mesh
const HIT_DUR = .35, RELOAD_DUR = .7;

const LOD0 = /_LOD$/, LOD1 = /^(?!.*_LOD$)/;
const hideWith = (lodRe, extra) => extra ? new RegExp(lodRe.source + '|' + extra) : lodRe;

function modelSpecs(){
  const aim = BAKE.aim;
  const loop = (clip, frames) => ({ frames, loop:true, layers:[{ clip }] });
  const once = (clip, frames, span) => ({ frames, layers:[{ clip, span }] });
  // team-colour strength per texel: the character's accent colour fully, plain steel partly
  const steel = (s,l) => s < .14 && l > .28 && l < .78 ? .36 : 0;
  const red = (h,s,l) => (h < .03 || h > .9) && s > .45 && l > .18 && l < .78 ? 1 : steel(s,l);
  const green = (h,s,l) => h > .25 && h < .55 && s > .35 && l > .12 && l < .8 ? 1 : steel(s,l);
  const blue = (h,s,l) => h > .52 && h < .7 && s > .2 && l > .15 && l < .8 ? 1 : steel(s,l);
  const melee = (idle, run, attacks, hit) => {
    const a = { idle:loop(idle, 8), run:loop(run, 16), hit:once(hit, 6), death0:once('Death_A', 14), death1:once('Death_B', 14), cheer:loop('Cheer', 12) };
    attacks.forEach((c, i) => a['atk'+i] = once(c, 12));
    return a;
  };
  const knightAnims = Object.assign(melee('Idle', 'Running_A', ['1H_Melee_Attack_Chop','1H_Melee_Attack_Slice_Diagonal','1H_Melee_Attack_Stab'], 'Hit_A'),
                                    { block:once('Block_Hit', 6, .6) });
  // the commander adds a raised-shield stance, shield bash, whirlwind, leap and war cry
  const commanderAnims = Object.assign({}, knightAnims, {
    block:loop('Blocking', 8), blockHit:once('Block_Hit', 6, .6), bash:once('Block_Attack', 12),
    spin:loop('2H_Melee_Attack_Spinning', 10), leap:once('Jump_Full_Short', 16), cry:once('Cheer', 10, .7) });
  const SHIELD_NODES = { round:'Round_Shield', badge:'Badge_Shield', rect:'Rectangle_Shield', spike:'Spike_Shield' };
  const others = keep => Object.values(SHIELD_NODES).filter(n => n !== keep).map(n => '^' + n).join('|');
  // riders: seated with legs around the horse, swinging the sword with the upper body
  const seat = (b, key, u) => {
    if(key!=='ride' && key!=='atk0') return;
    aim(b.upperlegl,  .55, -.25, 1); aim(b.lowerlegl,  .3, -1, .05);
    aim(b.upperlegr, -.55, -.25, 1); aim(b.lowerlegr, -.3, -1, .05);
  };
  return {
    soldier:{ rig:'knight', height:15, measure:[{clip:'Idle', t:0}], accent:red, lods:[hideWith(LOD0,others('Round_Shield')), hideWith(LOD1,others('Round_Shield'))], anims:knightAnims },
    // the commander is built from the player's choices (shield, helmet); size is always measured with helmet and badge shield
    commanderFor:(look, li) => {
      const lod = li ? LOD1 : LOD0, keep = SHIELD_NODES[look.shield] || 'Badge_Shield';
      return { rig:'knight', height:21.5, measure:[{clip:'Idle', t:0}], accent:red,
        hide:hideWith(lod, others(keep) + (look.helmet === false ? '|^Knight_Helmet' : '')),
        measureHide:hideWith(lod, others('Badge_Shield')), anims:commanderAnims };
    },
    archer:{ rig:'rogue', height:15, measure:[{clip:'Idle', t:0}], accent:green, lods:[LOD0, LOD1],
      anims:{ idle:loop('Idle',8), run:loop('Running_A',16), aim:{ frames:1, layers:[{clip:'2H_Ranged_Aiming', at:.5}] },
              shoot:once('2H_Ranged_Shoot',9), reload:once('2H_Ranged_Reload',12), hit:once('Hit_A',6),
              death0:once('Death_A',14), death1:once('Death_B',14), cheer:loop('Cheer',12) } },
    giant:{ rig:'barbarian', height:36, measure:[{clip:'2H_Melee_Idle', t:0}], accent:blue, lods:[LOD0, LOD1],
      anims:Object.assign(melee('2H_Melee_Idle', 'Walking_A', ['2H_Melee_Attack_Chop','2H_Melee_Attack_Slice','2H_Melee_Attack_Spin'], 'Hit_B'),
                          { atk0:once('2H_Melee_Attack_Chop',13), atk1:once('2H_Melee_Attack_Slice',13), atk2:once('2H_Melee_Attack_Spin',13) }) },
    rider:{ rig:'knight', height:15, measure:[{clip:'Idle', t:0}], accent:red, poseFn:seat, lods:[hideWith(LOD0,others('Round_Shield')), hideWith(LOD1,others('Round_Shield'))],
      anims:{ ride:{ frames:1, layers:[{clip:'Sit_Chair_Idle', at:0}] },
              atk0:{ frames:12, layers:[{clip:'Sit_Chair_Idle', part:'lower', at:0},{clip:'1H_Melee_Attack_Slice_Horizontal', part:'upper'}] },
              death0:once('Death_A',14) } },
    horse:{ rig:'horse', height:18, measure:[{clip:'Idle', t:0}], lods:[null],
      anims:{ idle:{ frames:1, layers:[{clip:'Idle', at:0}] }, run:loop('Gallop',12), death0:once('Death',12) } },
  };
}

/* ---------- materials: the team colour (per instance) only paints masked vertices ---------- */
let COL_MAT = null; const TEX_MATS = new Map();
function colMaterial(){
  if(COL_MAT) return COL_MAT;
  COL_MAT = new THREE.MeshLambertMaterial({ vertexColors:true });
  COL_MAT.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float teamMask;\n' + sh.vertexShader.replace('#include <color_vertex>', [
      '#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )', '  vColor = vec3( 1.0 );', '#endif',
      '#ifdef USE_COLOR', '  vColor *= color;', '#endif',
      '#ifdef USE_INSTANCING_COLOR', '  vColor = mix( vColor, vColor * instanceColor.xyz, teamMask );', '#endif',
    ].join('\n'));
  };
  COL_MAT.customProgramCacheKey = () => 'col-team';
  return COL_MAT;
}
function texMaterial(tex){
  if(TEX_MATS.has(tex)) return TEX_MATS.get(tex);
  tex.encoding = THREE.LinearEncoding; tex.anisotropy = 4; tex.needsUpdate = true;
  const m = new THREE.MeshLambertMaterial({ map:tex });
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float teamMask;\nvarying float vMask;\nvarying vec3 vTeam;\n' + sh.vertexShader.replace('#include <color_vertex>', [
      'vMask = teamMask;',
      '#ifdef USE_INSTANCING_COLOR', '  vTeam = instanceColor.xyz;', '#else', '  vTeam = vec3( 1.0 );', '#endif',
      '#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )', '  vColor = vec3( 1.0 );', '#endif',
    ].join('\n'));
    sh.fragmentShader = 'varying float vMask;\nvarying vec3 vTeam;\n' + sh.fragmentShader.replace('#include <map_fragment>', [
      '#include <map_fragment>',
      // accents (mask 1) are repainted in the team colour; partly masked steel is multiplied, so red stays crimson, not pink
      '{ float lum = dot( diffuseColor.rgb, vec3( .299, .587, .114 ) );',
      '  if( vMask > .99 ) diffuseColor.rgb = vTeam * ( .28 + 1.3 * lum );',
      '  else diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vTeam * 1.75, min( 1.0, vMask * 1.8 ) ); }',
    ].join('\n'));
  };
  m.customProgramCacheKey = () => 'tex-team';
  TEX_MATS.set(tex, m);
  return m;
}
/* A frame slot owns its InstancedMesh lazily and grows it when more units share that frame */
function frameMeshes(geos, mat, cap, shadow){
  return geos.map(g => { const slot = { g, mat, shadow, im:null, cap:0, n:0 }; MODEL.meshes.push(slot); return slot; });
}
function slotMesh(slot, need){
  const cap = Math.max(16, 1 << Math.ceil(Math.log2(need)));
  const m = new THREE.InstancedMesh(slot.g, slot.mat, cap);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, new THREE.Color(1,1,1)); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  if(slot.im){
    m.instanceMatrix.array.set(slot.im.instanceMatrix.array.subarray(0, slot.n*16));
    m.instanceColor.array.set(slot.im.instanceColor.array.subarray(0, slot.n*3));
    scene.remove(slot.im); slot.im.dispose();
  }
  m.count = 0; m.visible = false; m.frustumCulled = false; m.castShadow = slot.shadow;
  scene.add(m); slot.im = m; slot.cap = cap;
}

const tick = () => new Promise(r => setTimeout(r, 0));
async function loadModels(onProgress){
  const A = await BAKE.loadAll(MODEL_FILES, p => onProgress(p*.45));
  const rigs = {}; for(const k of Object.keys(A)) rigs[k] = new BAKE.Rig(A[k]);
  const specs = modelSpecs();
  const mobile = Math.min(innerWidth, innerHeight) < 700;
  const jobs = []; for(const [k, sp] of Object.entries(specs)) if(sp.lods) sp.lods.forEach((hide, li) => jobs.push([k, sp, hide, li]));
  MODEL.rigs = rigs; MODEL.specs = specs; MODEL.mobile = mobile;
  const baked = {};
  for(let j=0;j<jobs.length;j++){
    const [k, sp, hide, li] = jobs[j];
    const spec = Object.assign({}, sp, { hide:hide || undefined, measureHide: hide || undefined });
    (baked[k] = baked[k] || [])[li] = BAKE.bake(rigs[sp.rig], spec);
    onProgress(.45 + .5*(j+1)/(jobs.length+1));
    await tick();
  }
  // tank: hull (with rolling tracks), turret and gun baked separately so the turret swivels and the gun recoils
  let gunX = 0; A.tank.scene.updateMatrixWorld(true);
  A.tank.scene.traverse(o => { if(o.isMesh && /Gun/.test(o.name)){ const b=new THREE.Box3().setFromObject(o); gunX=b.getCenter(new THREE.Vector3()).x; } });
  const rotY = gunX >= 0 ? -Math.PI/2 : Math.PI/2;
  const tankSpec = (hide, anims) => ({ rig:'tank', height:TANK_H, measure:[], rotY, hide, measureHide:null,
    tint:{ Main:{color:0xdfe4ea, mask:.9}, Main_Light:{color:0xf2f4f7, mask:.9}, Main_Dark:{color:0xb4bac3, mask:.8} },
    anims: anims || { idle:{ frames:1, layers:[] } } });
  baked.tankBody = [BAKE.bake(rigs.tank, tankSpec(/Turret|Gun/, {
    idle:{ frames:1, layers:[{ clip:'Tank_Forward', at:0 }] },
    run:{ frames:10, loop:true, layers:[{ clip:'Tank_Forward' }] } }))];
  baked.tankTurret = [BAKE.bake(rigs.tank, tankSpec(/body|Track|Gun/i))];
  baked.tankGun = [BAKE.bake(rigs.tank, tankSpec(/body|Track|Turret/i))];
  const tg = baked.tankTurret[0].idle[0], gg = baked.tankGun[0].idle[0];
  tg.computeBoundingBox();
  const c = tg.boundingBox.getCenter(new THREE.Vector3());
  MODEL.pivot = new THREE.Vector3(c.x, 0, c.z);
  // shift positions only: geometry.translate() would also rewrite (and, being 16-bit, flatten) the normals
  for(const g of [tg, gg]){ const a = g.attributes.position.array; for(let i=0;i<a.length;i+=3){ a[i]-=c.x; a[i+2]-=c.z; } g.computeBoundingBox(); g.computeBoundingSphere(); }
  // where shells leave the barrel, relative to the turret pivot
  MODEL.muzzle = { fwd: gg.boundingBox.max.z, h: (gg.boundingBox.min.y + gg.boundingBox.max.y)/2 };

  for(const [k, lods] of Object.entries(baked)){
    const big = k==='giant' || k==='commander' || k.startsWith('tank');
    MODEL.V[k] = lods.map(b => {
      const mat = b.texture ? texMaterial(b.texture) : colMaterial(), V = { geo:b };
      for(const [a, geos] of Object.entries(b)) if(Array.isArray(geos)) V[a] = frameMeshes(geos, mat, MODEL_CAPS[k], !mobile || big);
      return V;
    });
  }
  // commanders: yours follows your chosen look; the enemy's keeps the default (and the lighter mesh)
  bakeCommander('commander', commanderLook(), 0);
  bakeCommander('commanderFoe', { shield:'badge', helmet:true }, 1);
  MODEL.team = [new THREE.Color(0x3f74ee), new THREE.Color(0xb3261b)];
  MODEL.dead = MODEL.team.map(c => c.clone().multiplyScalar(.5));
  MODEL.cmdColor = commanderColor(); MODEL.cmdDead = MODEL.cmdColor.clone().multiplyScalar(.5);
  MODEL.ready = true;
  onProgress(1);
}

/* (Re)bake a commander variant; used at load and whenever the player changes the commander's look */
function bakeCommander(key, look, li){
  const old = MODEL.V[key];
  if(old) for(const V of old) for(const [a, list] of Object.entries(V)) if(Array.isArray(list)) for(const sl of list){
    if(sl.im){ scene.remove(sl.im); sl.im.dispose(); }
    sl.g.dispose();
    const i = MODEL.meshes.indexOf(sl); if(i >= 0) MODEL.meshes.splice(i, 1);
  }
  const spec = MODEL.specs.commanderFor(look, li);
  const b = BAKE.bake(MODEL.rigs.knight, spec), mat = texMaterial(b.texture), V = { geo:b };
  for(const [a, geos] of Object.entries(b)) if(Array.isArray(geos)) V[a] = frameMeshes(geos, mat, 4, true);
  MODEL.V[key] = [V];
}
const ARMOR_COLORS = { gold:0xd9a520, steel:0x3f74ee, night:0x30343f, royal:0x7a3fd0 };
function commanderColor(){ return new THREE.Color(ARMOR_COLORS[commanderLook().armor] || ARMOR_COLORS.gold); }

/* ---------- per-frame drawing ---------- */
const _MM = { e:new THREE.Euler(), m:new THREE.Matrix4(), t:new THREE.Matrix4(), r:new THREE.Matrix4(), q:new THREE.Quaternion(), p:new THREE.Vector3(), s:new THREE.Vector3(1,1,1), y:new THREE.Vector3(0,1,0) };
function addInst(slot, matrix, color){
  if(!slot) return;
  if(slot.n >= slot.cap) slotMesh(slot, slot.n + 1 + (slot.n >> 1));   // grows, keeping what was written this frame
  slot.im.setMatrixAt(slot.n, matrix); slot.im.setColorAt(slot.n, color); slot.n++;
}
const frameAt = (list, k) => list[Math.max(0, Math.min(list.length-1, Math.floor(k*list.length)))];
const loopAt = (list, t) => list[((Math.floor(t*list.length)%list.length)+list.length)%list.length];
function deathFrames(V, u){ return V['death'+(u.deathVar||0)] || V.death0; }
function pickFrame(V, u, type){
  if(!u.alive) return frameAt(deathFrames(V,u), u.dieT/1.1);
  if(u.skill && V[u.skill.k]){
    const sk = u.skill, list = V[sk.k];
    return sk.k==='spin' ? loopAt(list, sk.t/.62) : frameAt(list, sk.t/sk.dur);
  }
  if(S.winner>=0 && u.team===S.winner && V.cheer) return loopAt(V.cheer, S.time*.85 + u.phase*.16);
  if(u.blockT>0 && (V.blockHit || V.block)) return frameAt(V.blockHit || V.block, 1-u.blockT/HIT_DUR);
  if(u.blocking && V.block) return loopAt(V.block, S.time*.9);
  if(u.hitT>0 && V.hit && !(u.atkT>0)) return frameAt(V.hit, 1-u.hitT/HIT_DUR);
  if(type==='archer' && S.mode!=='plan' && !u.moving && u.target && u.target.alive){
    if(u.atkT>0) return frameAt(V.shoot, 1-u.atkT/ANIM.archer);
    const since = S.btime-(u.shotAt||-9);
    if(since < RELOAD_DUR) return frameAt(V.reload, since/RELOAD_DUR);
    return V.aim[0];
  }
  if(u.atkT>0 && V.atk0) return frameAt(V['atk'+(u.atkVar||0)] || V.atk0, 1-u.atkT/(u.atkDur||ANIM[type]));
  if(u.moving && V.run) return loopAt(V.run, u.phase/TAU);
  return loopAt(V.idle, S.time*.45 + u.phase*.16);
}
const _cam = new THREE.Vector3(), BURNT = new THREE.Color(0x2b2826);   // a burnt-out hull
function renderModelUnits(){
  for(const m of MODEL.meshes) m.n = 0;
  const M = _MM, lodD2 = LOD_DIST*LOD_DIST;
  camera.getWorldPosition(_cam);
  for(const u of S.units){
    const col = u.alive ? MODEL.team[u.team] : MODEL.dead[u.team];
    const X = u.x-W/2, Z = u.y-H/2, dx = X-_cam.x, dz = Z-_cam.z, dy = _cam.y;
    const far = (dx*dx + dz*dz + dy*dy) > lodD2 ? 1 : 0;
    const variant = k => { const L = MODEL.V[k]; return L[Math.min(far, L.length-1)]; };
    M.q.setFromAxisAngle(M.y, u.heading); M.p.set(X, 0, Z); M.m.compose(M.p, M.q, M.s);
    if(u.type==='cavalry'){
      addInst(pickFrame(variant('horse'), u, 'horse'), M.m, col);
      const R = variant('rider');
      if(u.alive){
        M.t.makeTranslation(...RIDER_OFFSET); M.r.multiplyMatrices(M.m, M.t);
        addInst(u.atkT>0 ? frameAt(R.atk0, 1-u.atkT/ANIM.cavalry) : R.ride[0], M.r, col);
      } else {
        M.t.makeTranslation(8, 0, -3); M.r.multiplyMatrices(M.m, M.t);
        addInst(frameAt(R.death0, u.dieT/1.1), M.r, col);
      }
    } else if(u.type==='tank'){
      // hull rocks back when the gun fires and rides the terrain while driving; tracks roll with distance travelled
      const kick = u.atkT>0 ? Math.pow(u.atkT/ANIM.tank, 2) : 0;
      const drive = u.alive && u.moving;
      M.e.set(-kick*.06 + (drive ? Math.sin(u.phase*1.7)*.012 : 0), u.heading, drive ? Math.sin(u.phase*1.1)*.01 : 0, 'YXZ');
      M.q.setFromEuler(M.e); M.p.set(X, drive ? Math.abs(Math.sin(u.phase*2.3))*.25 : 0, Z); M.m.compose(M.p, M.q, M.s);
      const B = variant('tankBody'), tc = u.alive ? col : BURNT;
      addInst(drive ? loopAt(B.run, u.phase/TAU) : B.idle[0], M.m, tc);
      M.t.makeTranslation(MODEL.pivot.x, 0, MODEL.pivot.z); M.r.multiplyMatrices(M.m, M.t);
      if(u.alive){ M.q.setFromAxisAngle(M.y, u.aim-u.heading); M.t.makeRotationFromQuaternion(M.q); }
      else { M.e.set(.32, u.aim-u.heading+.5, .38, 'YXZ'); M.q.setFromEuler(M.e); M.t.compose(M.p.set(2, 3.5, -2), M.q, M.s); }
      M.r.multiply(M.t);
      addInst(variant('tankTurret').idle[0], M.r, tc);
      M.t.makeTranslation(0, 0, -kick*3.4); M.r.multiply(M.t);          // barrel recoil
      addInst(variant('tankGun').idle[0], M.r, tc);
    } else if(u.type==='commander'){
      const c = u.team===0 ? (u.alive ? MODEL.cmdColor : MODEL.cmdDead) : col;
      addInst(pickFrame(MODEL.V[u.team===0 ? 'commander' : 'commanderFoe'][0], u, 'commander'), M.m, c);
    } else if(MODEL.V[u.type]){
      addInst(pickFrame(variant(u.type), u, u.type), M.m, col);
    }
  }
  for(const sl of MODEL.meshes){
    const m = sl.im; if(!m) continue;
    m.count = sl.n; m.visible = sl.n > 0;
    if(sl.n){
      m.instanceMatrix.updateRange.count = sl.n*16; m.instanceMatrix.needsUpdate = true;
      m.instanceColor.updateRange.count = sl.n*3; m.instanceColor.needsUpdate = true;
    }
  }
}

/* Off-screen snapshot with the game's own renderer (a second WebGL context could knock out the main one) */
function snapshot(sc, cam, w, h){
  const rt = new THREE.WebGLRenderTarget(w, h), prev = renderer.getRenderTarget();
  const cc = new THREE.Color(); renderer.getClearColor(cc); const ca = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam);
  const px = new Uint8Array(w*h*4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
  renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca); rt.dispose();
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d'), img = cx.createImageData(w, h);
  for(let y=0;y<h;y++) img.data.set(px.subarray((h-1-y)*w*4, (h-y)*w*4), y*w*4);   // GL rows run bottom-up
  cx.putImageData(img, 0, 0);
  const url = cv.toDataURL('image/png'); cv.width = cv.height = 0;
  return url;
}
function iconStage(){
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff,0x667744,.8));
  const dl = new THREE.DirectionalLight(0xffffff,.75); dl.position.set(4,6,5); sc.add(dl);
  return sc;
}
function shoot(sc, group, w, h, fov, side){
  sc.add(group); group.updateMatrixWorld(true);
  const box = new THREE.Box3(), m = new THREE.Matrix4();
  group.children.forEach(im => { im.geometry.computeBoundingBox(); const b = im.geometry.boundingBox.clone(); im.getMatrixAt(0, m); b.applyMatrix4(m).applyMatrix4(group.matrixWorld); box.union(b); });
  const ctr = box.getCenter(new THREE.Vector3()), rad = box.getSize(new THREE.Vector3()).length()/2;
  const cam = new THREE.PerspectiveCamera(fov, w/h, 1, 4000), dist = rad/Math.sin(fov/2*Math.PI/180);
  cam.position.set(ctr.x+dist*(side||.2), ctr.y+dist*.22, ctr.z+dist*.95); cam.lookAt(ctr);
  const url = snapshot(sc, cam, w, h);
  sc.remove(group); group.children.forEach(im => im.dispose && im.dispose());
  return url;
}
function instanceOf(slot, x, y, z, color){
  const im = new THREE.InstancedMesh(slot.g, slot.mat, 1);
  im.setMatrixAt(0, new THREE.Matrix4().makeTranslation(x, y||0, z)); im.setColorAt(0, color);
  return im;
}

/* Card icons rendered from the detailed models in blue */
function makeModelIcons(){
  const out = {};
  try{
    const sc = iconStage(), V = k => MODEL.V[k][0], blue = MODEL.team[0];
    const layouts = {
      soldier:[[V('soldier').idle[0],-7,-3],[V('soldier').idle[2],0,4],[V('soldier').idle[4],7,-3]],
      archer:[[V('archer').aim[0],-5,0],[V('archer').aim[0],5,3]],
      cavalry:[[V('horse').idle[0],0,0],[V('rider').ride[0],RIDER_OFFSET[0],RIDER_OFFSET[2],RIDER_OFFSET[1]]],
      giant:[[V('giant').idle[0],0,0]],
      tank:[[V('tankBody').idle[0],0,0],[V('tankTurret').idle[0],MODEL.pivot.x,MODEL.pivot.z],[V('tankGun').idle[0],MODEL.pivot.x,MODEL.pivot.z]],
    };
    for(const t of ORDER){
      const g = new THREE.Group(); g.rotation.y = .55;
      for(const [slot,x,z,y] of layouts[t]) g.add(instanceOf(slot, x, y, z, blue));
      out[t] = shoot(sc, g, 144, 104, 26);
    }
  }catch(e){ console.warn('icons', e); }
  return out;
}
/* Portrait of your commander for the customisation sheet */
function makeCommanderPreview(){
  try{
    const sc = iconStage(), V = MODEL.V.commander[0], g = new THREE.Group();
    g.rotation.y = .45; g.add(instanceOf(V.block[2], 0, 0, 0, MODEL.cmdColor));
    return shoot(sc, g, 220, 260, 24, .1);
  }catch(e){ console.warn('preview', e); return ''; }
}
