/* Çöp Ordu — 3D unit models.
   Characters: KayKit Adventurers by Kay Lousberg (CC0). Horse and tank: Quaternius (CC0).
   Every animation is baked into frame meshes; each frame is one InstancedMesh, with a detailed (LOD0)
   and a simplified (LOD1) version so a whole army costs a few dozen draw calls. */
"use strict";
const MODEL = { ready:false, failed:false, V:{}, meshes:[], pivot:null, team:null, dead:null };
const MODEL_VER = 3;                  // bump when a model file changes, so browsers fetch the new one
const MODEL_FILES = Object.fromEntries(Object.entries({
  knight:'models/kk_knight.glb', rogue:'models/kk_rogue.glb', barbarian:'models/kk_barbarian.glb',
  horse:'models/horse.glb', tank:'models/tank.glb',
}).map(([k, v]) => [k, v + '?v=' + MODEL_VER]));
const MODEL_CAPS = { golem:200, soldier:1600, archer:1100, rider:550, horse:550, giant:200, commander:4, tankBody:200, tankTurret:200, tankGun:200 };
const TANK_H = 21;                    // a tank stands well above a soldier (15)
const RIDER_OFFSET = [0, 6.4, 1.6];
const LOD_DIST = 260;                 // beyond this distance from the camera, units use the simplified mesh
const HIT_DUR = .35, RELOAD_DUR = .7;
const CROWN_POS = [0, .82, .02], CROWN_SCALE = .78;           // on the knight's (large) head

const LOD0 = /_LOD$/, LOD1 = /^(?!.*_LOD$)/;
const hideWith = (lodRe, extra) => extra ? new RegExp(lodRe.source + '|' + extra) : lodRe;

/* ---------- the golem: boulders strung on the barbarian's skeleton, with glowing crystals ---------- */
function golemBody(lite){
  const STONE_A = [.56,.32], STONE_B = [.56,.06], GLOW = [.5,.755];          // palette texels: pale stone, dark stone, white (takes team colour)
  const R = (a, b, r, dark) => [a, b, r, 'rock', { uv: dark ? STONE_B : STONE_A }];
  const segs = [
    R('hips','chest',.24), R('chest','head',.1, 1),
    R('chest','upperarml',.12, 1), R('upperarml','lowerarml',.15), R('lowerarml','handl',.17, 1),
    R('chest','upperarmr',.12, 1), R('upperarmr','lowerarmr',.15), R('lowerarmr','handr',.17, 1),
    R('hips','upperlegl',.13, 1), R('upperlegl','lowerlegl',.16), R('lowerlegl','footl',.14, 1), R('footl','toesl',.11),
    R('hips','upperlegr',.13, 1), R('upperlegr','lowerlegr',.16), R('lowerlegr','footr',.14, 1), R('footr','toesr',.11) ];
  const stone = (bone, r, o) => [bone, r, Object.assign({ rock:1, uv:STONE_A }, o)];
  const balls = [
    stone('head', .17, { up:.1 }), stone('handl', .2, { uv:STONE_B }), stone('handr', .2, { uv:STONE_B }), stone('chest', .26),
    ['head', .035, { up:.13, fwd:.15, side:-.06, gem:1, uv:GLOW, mask:1 }], ['head', .035, { up:.13, fwd:.15, side:.06, gem:1, uv:GLOW, mask:1 }],
    ['chest', .09, { up:.05, fwd:.22, gem:1, sy:1.5, uv:GLOW, mask:1 }],
    ...(lite ? [] : [stone('upperarml', .15, { uv:STONE_B }), stone('upperarmr', .15, { uv:STONE_B }), stone('hips', .2),
                     ['upperarml', .05, { up:.05, fwd:.08, gem:1, uv:GLOW, mask:1 }], ['upperarmr', .05, { up:.05, fwd:.08, gem:1, uv:GLOW, mask:1 }]])];
  return { ref:['hips','head'], uv:STONE_A, mask:.18, radial:6, segs, balls };
}

function modelSpecs(){
  const aim = BAKE.aim;
  const loop = (clip, frames) => ({ frames, loop:true, layers:[{ clip }] });
  const once = (clip, frames, span) => ({ frames, layers:[{ clip, span }] });
  // team colour per texel: each character's accent colour fully (capes, trims), plain steel partly
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
  const commanderAnims = Object.assign({}, knightAnims, {
    block:loop('Blocking', 8), blockHit:once('Block_Hit', 6, .6), bash:once('Block_Attack', 12),
    spin:loop('2H_Melee_Attack_Spinning', 10), leap:once('Jump_Full_Short', 16), cry:once('Cheer', 10, .7) });
  const SHIELD_NODES = { round:'Round_Shield', badge:'Badge_Shield', rect:'Rectangle_Shield', spike:'Spike_Shield' };
  const others = keep => Object.values(SHIELD_NODES).filter(n => n !== keep).map(n => '^' + n).join('|');
  const lods = extra => extra ? [hideWith(LOD0, extra), hideWith(LOD1, extra)] : [LOD0, LOD1];
  const seat = (b, key) => {
    if(key!=='ride' && key!=='atk0') return;
    aim(b.upperlegl,  .55, -.25, 1); aim(b.lowerlegl,  .3, -1, .05);
    aim(b.upperlegr, -.55, -.25, 1); aim(b.lowerlegr, -.3, -1, .05);
  };
  return {
    // footman: helmeted knight with sword, round shield and a cape in the team colour
    soldier:{ rig:'knight', height:15, measure:[{clip:'Idle', t:0}], accent:red, lods:lods(others('Round_Shield')).map(hide => ({ hide })), anims:knightAnims },
    // crossbowman: hooded rogue with a cloak
    archer:{ rig:'rogue', height:15, measure:[{clip:'Idle', t:0}], accent:green, lods:lods().map(hide => ({ hide })),
      anims:{ idle:loop('Idle',8), run:loop('Running_A',16), aim:{ frames:1, layers:[{clip:'2H_Ranged_Aiming', at:.5}] },
              shoot:once('2H_Ranged_Shoot',9), reload:once('2H_Ranged_Reload',12), hit:once('Hit_A',6),
              death0:once('Death_A',14), death1:once('Death_B',14), cheer:loop('Cheer',12) } },
    // giant: towering barbarian in a bear-skin hat with a two-handed axe
    giant:{ rig:'barbarian', height:36, measure:[{clip:'2H_Melee_Idle', t:0}], accent:blue, lods:lods('Unarmed').map(hide => ({ hide })),
      anims:Object.assign(melee('2H_Melee_Idle', 'Walking_A', ['2H_Melee_Attack_Chop','2H_Melee_Attack_Slice','2H_Melee_Attack_Spin'], 'Hit_B'),
                          { atk0:once('2H_Melee_Attack_Chop',13), atk1:once('2H_Melee_Attack_Slice',13), atk2:once('2H_Melee_Attack_Spin',13) }) },
    golem:{ rig:'barbarian', height:40, measure:[{clip:'Unarmed_Idle', t:0}], accent:blue,
      lods:[0,1].map(li => ({ hide:hideWith(li ? LOD1 : LOD0, '^Barbarian_|2H_Axe'), stick:golemBody(!!li) })),
      anims:{ idle:loop('Unarmed_Idle',8), run:loop('Walking_C',16), hit:once('Hit_B',6),
              atk0:once('Unarmed_Melee_Attack_Punch_A',13), atk1:once('Unarmed_Melee_Attack_Punch_B',13), atk2:once('Unarmed_Melee_Attack_Kick',12),
              death0:once('Death_A',14), death1:once('Death_B',14), cheer:loop('Cheer',12) } },
    rider:{ rig:'knight', height:15, measure:[{clip:'Idle', t:0}], accent:red, poseFn:seat, lods:lods(others('Round_Shield')).map(hide => ({ hide })),
      anims:{ ride:{ frames:1, layers:[{clip:'Sit_Chair_Idle', at:0}] },
              atk0:{ frames:12, layers:[{clip:'Sit_Chair_Idle', part:'lower', at:0},{clip:'1H_Melee_Attack_Slice_Horizontal', part:'upper'}] },
              death0:once('Death_A',14) } },
    // your commander: larger knight with the shield and headgear you picked
    commanderFor:(look, li) => {
      const lod = li ? LOD1 : LOD0, keep = SHIELD_NODES[look.shield] || 'Badge_Shield', head = look.head || 'helmet';
      return { rig:'knight', height:21.5, measure:[{clip:'Idle', t:0}], accent:red,
        hide:hideWith(lod, others(keep) + (head !== 'helmet' ? '|^Knight_Helmet' : '')),
        measureHide:hideWith(lod, others('Badge_Shield')), attach: head === 'crown' ? [CROWN] : [], anims:commanderAnims };
    },
    horse:{ rig:'horse', height:18, measure:[{clip:'Idle', t:0}], lods:[{}],
      anims:{ idle:{ frames:1, layers:[{clip:'Idle', at:0}] }, run:loop('Gallop',12), death0:once('Death',12) } },
  };
}
/* a gold crown with a ruby, resting on the knight's head */
const CROWN = (() => {
  const band = new THREE.CylinderGeometry(.62, .55, .28, 14, 1, true);
  const pts = []; for(let i=0;i<7;i++){ const g = new THREE.ConeGeometry(.12, .32, 4); const a = i/7*Math.PI*2; g.translate(Math.sin(a)*.58, .29, Math.cos(a)*.58); pts.push(g); }
  const gem = new THREE.OctahedronGeometry(.12); gem.translate(0, .02, .6);
  const gold = [.56, .3], ruby = [.06, .33];   // texels of the knight palette
  return { bone:'head', pos:CROWN_POS, scale:CROWN_SCALE, parts:[{ g:band, color:new THREE.Color(0xe8b53a), name:'gold', uv:gold }, ...pts.map(g => ({ g, color:new THREE.Color(0xf2c64a), name:'gold', uv:gold })), { g:gem, color:new THREE.Color(0xd8263a), name:'gem', uv:ruby }] };
})();

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
    const [k, sp, lod, li] = jobs[j];
    const spec = Object.assign({}, sp, lod, { measureHide: lod.hide });
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
  bakeCommander('commanderFoe', { shield:'badge', head:'helmet' }, 1);
  buildConstructs();
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
    } else if(u.type==='atower' || u.type==='btower'){
      // buildings sit square on the ground; destroyed ones sink and lean
      const k = u.alive ? 0 : Math.min(1, u.dieT/1.2), B = MODEL.B;
      M.e.set(k*.14, 0, k*.09, 'YXZ'); M.q.setFromEuler(M.e); M.p.set(X, -k*12, Z); M.m.compose(M.p, M.q, M.s);
      const c = u.alive ? col : MODEL.dead[u.team];
      if(u.type==='atower'){
        addInst(B.atower, M.m, c);
        if(u.alive){ M.q.setFromAxisAngle(M.y, u.heading); M.p.set(X, 28.2, Z); M.r.compose(M.p, M.q, M.s); addInst(pickFrame(variant('archer'), u, 'archer'), M.r, col); }
      } else {
        addInst(B.btowerBase, M.m, c);
        const kick = u.atkT>0 ? Math.pow(u.atkT/ANIM.btower, 2) : 0;
        M.e.set(-kick*.35, u.aim, 0, 'YXZ'); M.q.setFromEuler(M.e); M.p.set(0, 22, 0); M.t.compose(M.p, M.q, M.s);
        M.r.multiplyMatrices(M.m, M.t); addInst(B.btowerTop, M.r, c);
      }
    } else if(u.type==='catapult'){
      const B = MODEL.B, c = u.alive ? col : MODEL.dead[u.team];
      addInst(B.catBody, M.m, c);
      // the arm rests low behind the axle, whips over the top when it throws, then is winched back down
      let a = -.35;
      if(u.atkT>0){ const k = 1-u.atkT/ANIM.catapult; a = k < .45 ? -.35 + (k/.45)*2.45 : 2.1 - ((k-.45)/.55)*2.45; }
      if(!u.alive) a = .4;
      M.e.set(a, 0, 0, 'XYZ'); M.q.setFromEuler(M.e); M.p.set(0, 15.5, 1); M.t.compose(M.p, M.q, M.s);
      M.r.multiplyMatrices(M.m, M.t); addInst(B.catArm, M.r, c);
      if(u.alive){   // a knight works the winch beside it
        M.t.makeTranslation(-14, 0, -6); M.r.multiplyMatrices(M.m, M.t);
        const sv = variant('soldier'); addInst(u.atkT>0 ? frameAt(sv.atk2, 1-u.atkT/ANIM.catapult) : loopAt(sv.idle, S.time*.45 + u.phase*.16), M.r, col);
      }
    } else if(u.type==='balloon' || u.type==='dragon'){
      // flyers bob in the air; when shot down they tumble and fall
      const U = UNITS[u.type], fall = u.alive ? 0 : Math.min(1, u.dieT/.9);
      const y = u.alive ? U.flyH + Math.sin(S.time*1.4 + u.phase)*(u.type==='dragon'?3:2) : U.flyH*(1-fall*fall) + (u.type==='dragon' ? 4 : 2);
      const roll = u.alive ? Math.sin(S.time*.9 + u.phase)*.06 : fall*(u.type==='dragon' ? 1.1 : .5);
      M.e.set(u.type==='dragon' && u.alive && u.moving ? .12 : 0, u.heading, roll, 'YXZ'); M.q.setFromEuler(M.e);
      M.p.set(X, y, Z); M.s.set(1, u.type==='balloon' && fall>=1 ? .45 : 1, 1); M.m.compose(M.p, M.q, M.s); M.s.set(1,1,1);
      const c = u.alive ? col : MODEL.dead[u.team], B = MODEL.B;
      if(u.type==='balloon') addInst(B.balloon, M.m, c);
      else if(u.breathT>0 && u.alive) addInst(loopAt(B.dragonFire, S.time*3), M.m, c);
      else addInst(u.alive ? loopAt(B.dragonFly, S.time*1.6 + u.phase*.16) : B.dragonFly[2], M.m, c);
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
      golem:[[V('golem').idle[0],0,0]],
      tank:[[V('tankBody').idle[0],0,0],[V('tankTurret').idle[0],MODEL.pivot.x,MODEL.pivot.z],[V('tankGun').idle[0],MODEL.pivot.x,MODEL.pivot.z]],
    };
    Object.assign(layouts, MODEL.iconLayouts || {});
    for(const t of ORDER){
      if(!layouts[t]) continue;
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

/* ---------- built units: towers, catapult, balloon, dragon (made from simple solids) ---------- */
/* parts: [geometry, matrix, colour, teamMask] → one geometry with colour + mask, for the colour material */
function solid(parts){
  let n = 0; const pos = [], nor = [], col = [], msk = [], idx = [];
  const c = new THREE.Color(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  for(const [geo, m, color, mask] of parts){
    const g = geo.index ? geo : geo, P = g.attributes.position, N = g.attributes.normal;
    nm.getNormalMatrix(m); c.set(color);
    for(let i=0;i<P.count;i++){
      v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      col.push(c.r, c.g, c.b); msk.push(mask || 0);
    }
    if(g.index) for(const i of g.index.array) idx.push(n + i); else for(let i=0;i<P.count;i++) idx.push(n + i);
    n += P.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('teamMask', new THREE.Float32BufferAttribute(msk, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n*2), 2));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}
const M4 = (x=0,y=0,z=0, rx=0,ry=0,rz=0, sx=1,sy=sx,sz=sx) => new THREE.Matrix4().compose(new THREE.Vector3(x,y,z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)), new THREE.Vector3(sx,sy,sz));
const G = {
  box:(w,h,d) => new THREE.BoxGeometry(w,h,d),
  cyl:(rt,rb,h,s=12,open=false) => new THREE.CylinderGeometry(rt,rb,h,s,1,open),
  cone:(r,h,s=10) => new THREE.ConeGeometry(r,h,s),
  ball:(r,w=12,hh=8) => new THREE.SphereGeometry(r,w,hh),
  rock:(r) => new THREE.DodecahedronGeometry(r,0),
  torus:(r,t) => new THREE.TorusGeometry(r,t,6,16),
};
const STONE = 0xa9a39a, STONE2 = 0x8c867d, WOOD = 0x7a5534, WOOD2 = 0x5c3e24, IRON = 0x3a3d42, CLOTH = 0xf2f2f2;

function buildArcherTower(){
  const P = [];
  P.push([G.cyl(12,14,26,12), M4(0,13,0), STONE], [G.cyl(14.5,14.5,2.4,12), M4(0,27,0), WOOD]);
  for(let i=0;i<8;i++){ const a = i/8*TAU; P.push([G.box(4,4.5,3), M4(Math.sin(a)*13.2, 30.4, Math.cos(a)*13.2, 0, a, 0), STONE2]); }
  P.push([G.cyl(.5,.5,22,5), M4(-9,38,-9), WOOD2], [G.box(.3,7,11), M4(-9,45,-3.5), CLOTH, 1]);
  for(let i=0;i<5;i++) P.push([G.box(14.5,.6,.6), M4(0, 4+i*5, 12.6 - (i%2)*.3), STONE2]);
  P.push([G.box(6,10,1), M4(0,6,13.2), WOOD2]);
  return solid(P);
}
function buildBombTower(){
  const base = [];
  base.push([G.cyl(14,17,20,10), M4(0,10,0), STONE], [G.cyl(15.5,15.5,2.6,10), M4(0,20.5,0), IRON]);
  for(let i=0;i<10;i++){ const a = i/10*TAU; base.push([G.box(4,4,3), M4(Math.sin(a)*14.5, 23.5, Math.cos(a)*14.5, 0, a, 0), STONE2]); }
  base.push([G.cyl(15,15,1.6,10), M4(0,15,0), CLOTH, 1]);
  const mortar = [];
  mortar.push([G.cyl(6,6,3,10), M4(0,1.5,0), IRON], [G.box(9,5,6), M4(0,4.5,0), WOOD2]);
  mortar.push([G.cyl(3.6,4.4,11,12,true), M4(0,9,2.6, .75,0,0), IRON], [G.torus(3.8,.7), M4(0,12.6,6.2, .75+Math.PI/2,0,0), IRON]);
  mortar.push([G.cyl(4.6,4.6,1.2,10), M4(0,6,0), CLOTH, 1]);
  return { base:solid(base), top:solid(mortar) };
}
function buildCatapult(){
  const body = [];
  for(const x of [-7,7]){ body.push([G.box(2,2.5,26), M4(x,4,0), WOOD]); body.push([G.box(2,14,2), M4(x,10,1, -.25,0,0), WOOD2]); }
  for(const z of [-9,9]) for(const x of [-8.6,8.6]) body.push([G.cyl(4,4,1.6,12), M4(x,4,z, 0,0,Math.PI/2), WOOD2], [G.torus(4,.45), M4(x*1.02,4,z, 0,Math.PI/2,0), IRON]);
  body.push([G.box(16,1.6,2), M4(0,4,-9), WOOD], [G.box(16,1.6,2), M4(0,4,9), WOOD], [G.cyl(.9,.9,16,8), M4(0,15.5,1, 0,0,Math.PI/2), IRON]);
  body.push([G.box(16.4,1,3), M4(0,6,-12), CLOTH, 1]);
  const arm = [];   // pivot at the axle (origin); the arm points backwards (−z) when loaded
  arm.push([G.box(1.8,1.8,26), M4(0,0,-6), WOOD], [G.box(7,6,6), M4(0,-3.5,6.5), STONE2], [G.cyl(3.4,2.2,2.6,10,true), M4(0,1.2,-18.5), WOOD2]);
  return { body:solid(body), arm:solid(arm) };
}
function buildBalloon(){
  const P = [];
  const env = new THREE.SphereGeometry(13, 16, 14), p = env.attributes.position, cols = [], msk = [];
  // vertical gores alternate team colour and white
  const parts = [];
  for(let i=0;i<p.count;i++){ const a = Math.atan2(p.getX(i), p.getZ(i)); const stripe = Math.floor((a+Math.PI)/TAU*12) % 2; msk.push(stripe ? 1 : 0); }
  const envG = solid([[env, M4(0,0,0, 0,0,0, 1,1.18,1), CLOTH, 0]]);
  envG.attributes.teamMask.array.set(msk);
  P.push([G.cone(6,6,12), M4(0,-15.5,0, Math.PI,0,0), CLOTH, 1]);
  P.push([G.box(7,4.5,7), M4(0,-27,0), WOOD], [G.box(7.4,.8,7.4), M4(0,-24.8,0), WOOD2]);
  for(const [x,z] of [[-3,-3],[3,-3],[-3,3],[3,3]]) P.push([G.cyl(.15,.15,10,4), M4(x*.75,-20.5,z*.75, z*.06,0,-x*.06), WOOD2]);
  for(let i=0;i<4;i++) P.push([G.ball(1.2,6,4), M4(-3.6+i*2.4, -28.5, 3.8), 0xc9b48a]);
  const rest = solid(P);
  return mergeSolids([envG, rest]);
}
function mergeSolids(list){
  let n = 0; const attrs = { position:[], normal:[], color:[], teamMask:[], uv:[] }, idx = [];
  for(const g of list){
    for(const k of Object.keys(attrs)) attrs[k].push(...g.attributes[k].array);
    for(const i of g.index.array) idx.push(n + i);
    n += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(attrs.position, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(attrs.normal, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(attrs.color, 3)); g.setAttribute('teamMask', new THREE.Float32BufferAttribute(attrs.teamMask, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(attrs.uv, 2)); g.setIndex(idx); g.computeBoundingSphere();
  return g;
}
/* the dragon: body, neck, head, tail and two membrane wings; frames sweep the wings and open the jaw */
function wingGeo(side, flap){
  // a fan of 4 fingers from the shoulder; flap tilts the whole wing about the body axis
  const tips = [[0,0],[14,4],[24,1],[28,-6],[22,-13],[12,-14]];
  const pos = [], nor = [], col = [], msk = [], idx = [];
  const shoulder = new THREE.Vector3(side*3.5, 3, 2), rot = new THREE.Matrix4().makeRotationZ(side*flap);
  const pts = tips.map(([x,z]) => new THREE.Vector3(side*x, 0, z).applyMatrix4(rot).add(shoulder));
  for(let i=1;i<pts.length-1;i++){ for(const p of [pts[0], pts[i], pts[i+1]]){ pos.push(p.x,p.y,p.z); nor.push(0,1,0); col.push(.82,.82,.86); msk.push(.7); } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor,3));
  g.computeVertexNormals();
  // bones along the fingers
  const bones = [];
  for(let i=1;i<pts.length-1;i++){ const a = pts[0], b = pts[i], d = b.clone().sub(a), len = d.length(); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), d.normalize()); bones.push([G.cyl(.35,.6,len,5), new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), q, new THREE.Vector3(1,1,1)), 0x4a3a3a, .3]); }
  return { membrane:g, bones };
}
function dragonFrame(flap, jaw){
  const P = [], SC = 0xd8d8de, BELLY = 0xe8d8b0, HORN = 0xf0e8d0;
  P.push([G.ball(1,14,10), M4(0,0,0, 0,0,0, 6.5,6,13), SC, .85], [G.ball(1,10,8), M4(0,-2.6,1, 0,0,0, 5,3.6,10), BELLY, 0]);
  // neck rising forward, head at its end
  const neck = [[0,3,11,4.2],[0,6,16,3.6],[0,9,20,3.2]];
  for(const [x,y,z,r] of neck) P.push([G.ball(r,10,8), M4(x,y,z), SC, .85]);
  P.push([G.ball(1,12,8), M4(0,11,25, -.15,0,0, 3.6,3,6), SC, .85]);
  P.push([G.box(4.6,1.4,7), M4(0,9.2 - jaw*2,26.5, jaw*.6,0,0), SC, .85]);
  for(const s of [-1,1]){ P.push([G.cone(.8,5,6), M4(s*1.6,14,22, -1.1,0,s*.3), HORN, 0]); P.push([G.ball(.7,6,4), M4(s*2.4,12,27), 0xffd23a, 0]); }
  // tail tapering behind
  for(let i=0;i<6;i++) P.push([G.ball(3.6-i*.5,8,6), M4(0, -1+i*.35, -12-i*5), SC, .85]);
  P.push([G.cone(2.8,5,4), M4(0,1.2,-43, -Math.PI/2,0,0), SC, .85]);
  for(let i=0;i<7;i++) P.push([G.cone(1,3,4), M4(0,5.8-Math.abs(i-2)*.4,8-i*4.5), HORN, 0]);
  for(const s of [-1,1]) for(const z of [-5,6]) P.push([G.cyl(.9,.7,6,6), M4(s*3.5,-5.5,z, .6,0,0), SC, .85]);
  const parts = [solid(P)];
  for(const side of [-1,1]){ const w = wingGeo(side, flap); parts.push(solid([[w.membrane, new THREE.Matrix4(), 0xc4c4cc, .7]])); parts.push(solid(w.bones)); }
  return mergeSolids(parts);
}

/* create frame slots for the built units; called once the materials exist */
function buildConstructs(){
  const cm = colMaterial(), slot = (g, cap) => frameMeshes([g], cm, cap, true)[0];
  const bt = buildBombTower(), cp = buildCatapult();
  MODEL.B = {
    atower: slot(buildArcherTower(), 64),
    btowerBase: slot(bt.base, 64), btowerTop: slot(bt.top, 64),
    catBody: slot(cp.body, 64), catArm: slot(cp.arm, 64),
    balloon: slot(buildBalloon(), 64),
    dragonFly: Array.from({ length:8 }, (_, i) => slot(dragonFrame(Math.sin(i/8*TAU)*.75, 0), 32)),
    dragonFire: Array.from({ length:6 }, (_, i) => slot(dragonFrame(Math.sin(i/6*TAU)*.35, 1), 32)),
  };
  const B = MODEL.B, at = (s, x=0, z=0, y=0) => [s, x, z, y];
  MODEL.iconLayouts = {
    atower:[at(B.atower), at(MODEL.V.archer[0].aim[0], 0, 0, 28)],
    btower:[at(B.btowerBase), at(B.btowerTop, 0, 0, 22)],
    catapult:[at(B.catBody), at(B.catArm, 0, 1, 15.5)],
    balloon:[at(B.balloon)],
    dragon:[at(B.dragonFly[2])],
  };
}
