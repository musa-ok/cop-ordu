/* Çöp Ordu — real 3D unit models.
   Characters, horse and tank by Quaternius (CC0, quaternius.com). Each animation is baked into a few
   frame meshes; every frame is one InstancedMesh, so a whole army costs a few dozen draw calls. */
"use strict";
const MODEL = { ready:false, failed:false, V:{}, meshes:[], pivot:null, team:null, dead:null };
const MODEL_FILES = {
  knight:'models/knightcharacter.glb', horse:'models/horse.glb', tank:'models/tank.glb', helmet:'models/helmet1.glb',
  hammer:'models/hammer_double.glb', gsword:'models/sword_golden.glb', gshield:'models/shield_celtic_golden.glb',
};
const MODEL_CAPS = { soldier:1600, archer:1100, rider:550, horse:550, giant:200, commander:4, tankBody:200, tankTurret:200 };
const RIDER_OFFSET = [0, 5.5, -.4];

/* Low-poly props: swords, shields, bows and lances are drawn hundreds of times, so they stay light */
function mPart(g, color, name){ return { g, color:new THREE.Color(color), name:name||'' }; }
function mBox(w,h,d,x,y,z){ const g=new THREE.BoxGeometry(w,h,d); g.translate(x,y,z); return g; }
function lowPolyProps(){
  const face=new THREE.CylinderGeometry(.72,.72,.1,10); face.rotateX(Math.PI/2);
  const boss=new THREE.SphereGeometry(.17,6,4); boss.translate(0,0,.09);
  const arc=new THREE.TorusGeometry(1.6,.07,4,10,Math.PI); arc.rotateZ(-Math.PI/2);
  const shaft=new THREE.CylinderGeometry(.08,.1,7,5); shaft.translate(0,2.6,0);
  const tip=new THREE.ConeGeometry(.18,.7,5); tip.translate(0,6.45,0);
  const quiver=new THREE.CylinderGeometry(.24,.2,1.4,6);
  const cape=new THREE.BoxGeometry(1.5,2.6,.08); cape.translate(0,-1.3,0);
  // giant's horned iron helm and beard
  const horn = s => { const g=new THREE.ConeGeometry(.2,1.1,6); g.translate(0,.55,0); g.rotateZ(-s*1.05); g.translate(s*.78,.95,0); return g; };
  const beard=new THREE.ConeGeometry(.55,1.25,6); beard.rotateX(Math.PI); beard.translate(0,-.35,.42);
  const brow=mBox(1.45,.22,.25,0,.62,.62);
  return {
    sword:[ mPart(mBox(.16,1.75,.05,0,1.15,0),0xd5dae1), mPart(mBox(.7,.1,.16,0,.25,0),0x8a6a3a), mPart(mBox(.1,.45,.1,0,0,0),0x4a3424) ],
    shield:[ mPart(face,0xffffff,'face'), mPart(boss,0xb9bfc7) ],
    bow:[ mPart(arc,0x6a4122), mPart(mBox(.03,3.2,.03,-.02,0,0),0xe8e2d0) ],
    lance:[ mPart(shaft,0x7a5230), mPart(tip,0xc9ced6), mPart(mBox(.02,.55,.9,0,5.5,.45),0xffffff,'pennant') ],
    quiver:[ mPart(quiver,0x5c3b22), mPart(mBox(.36,.2,.36,0,.75,0),0xd04030) ],
    cape:[ mPart(cape,0xffffff,'cape') ],
    horns:[ mPart(horn(1),0xe9e0c8), mPart(horn(-1),0xe9e0c8) ],
    beard:[ mPart(beard,0x6b4428), mPart(brow,0x4a4f57) ],
    pauldron:[ mPart(new THREE.SphereGeometry(.62,7,5,0,Math.PI*2,0,Math.PI*.55),0x5d636c), mPart(mBox(.9,.12,.9,0,-.02,0),0x3a3f46) ],
  };
}

function modelSpecs(A){
  const P = k => BAKE.staticParts(A[k]), L = lowPolyProps(), aim = BAKE.aim;
  const ARMOR = { Armor:{ color:0xeef1f5, mask:1 } };
  const helmet = (tint, scale) => ({ bone:'Head', parts:P('helmet'), pos:[0,.75,0], scale:scale||1, tint });
  const melee = (idle, run, frames) => ({
    idle:{ frames:1, layers:[{clip:idle, at:0}] },
    run:{ frames:frames||6, loop:true, layers:[{clip:run}] },
    attack:{ frames:4, layers:[{clip:idle, part:'lower', at:0},{clip:'Run_swordAttack', part:'upper'}] },
    death:{ frames:4, layers:[{clip:'Death'}] },
  });
  const sitting = (b, key, u) => {
    if(key!=='ride' && key!=='attack') return;
    aim(b.UpperLegL, .4,-.1,1); aim(b.LowerLegL, .25,-1,.1);
    aim(b.UpperLegR,-.4,-.1,1); aim(b.LowerLegR,-.25,-1,.1);
    aim(b.UpperArmL, .3,-.7,.5); aim(b.LowerArmL, 0,-.25,1);
    const k = key==='attack' ? Math.sin(u*Math.PI) : 0;
    aim(b.UpperArmR, -.3,-.6+k*.4,.6+k*.4); aim(b.LowerArmR, -.05,-.1,1);
  };
  const drawBow = (b, key, u) => {
    if(key!=='attack') return;
    const pull = u<.6 ? u/.6 : 0;
    aim(b.UpperArmL, .15,.12,1); aim(b.LowerArmL, .1,.12,1);
    aim(b.UpperArmR, -.9,.05,.1-pull*.4); aim(b.LowerArmR, 1,.15,.35-pull*.5);
  };
  return {
    soldier:{ rig:'knight', height:15, measure:[{clip:'Idle_swordRight', t:0}], tint:ARMOR,
      attach:[ { bone:'PalmR', parts:L.sword, rot:[-1.05,0,0] },
               { bone:'PalmL', parts:L.shield, pos:[0,.3,0], rot:[0,-Math.PI/2,0], tint:{ face:{mask:1} } },
               helmet() ],
      anims:melee('Idle_swordRight','Run_swordRight') },
    archer:{ rig:'knight', height:15, measure:[{clip:'Idle', t:0}], tint:ARMOR, poseFn:drawBow,
      attach:[ { bone:'PalmL', parts:L.bow, pos:[0,.15,0], rot:[0,Math.PI,Math.PI/2] },
               { bone:'Torso', parts:L.quiver, pos:[.3,.35,-.5], rot:[.35,0,.3] },
               helmet({ Grey:{color:0x8a6440}, DarkGrey:{color:0x5e4329} }) ],
      anims:{ idle:{ frames:1, layers:[{clip:'Idle', at:0}] }, run:{ frames:6, loop:true, layers:[{clip:'Run'}] },
              attack:{ frames:3, layers:[{clip:'Idle', at:0}] }, death:{ frames:4, layers:[{clip:'Death'}] } } },
    rider:{ rig:'knight', height:15, measure:[{clip:'Idle', t:0}], tint:ARMOR, poseFn:sitting,
      attach:[ { bone:'PalmR', parts:L.lance, tint:{ pennant:{mask:1} } }, helmet() ],
      anims:{ ride:{ frames:1, layers:[{clip:'Idle', at:0}] }, attack:{ frames:3, layers:[{clip:'Idle', at:0}] },
              death:{ frames:4, layers:[{clip:'Death'}] } } },
    commander:{ rig:'knight', height:21.5, measure:[{clip:'Idle_swordRight', t:0}], tint:ARMOR,
      attach:[ { bone:'PalmR', parts:P('gsword'), rot:[-1.05,0,0], scale:.6 },
               { bone:'PalmL', parts:P('gshield'), pos:[0,.3,0], rot:[0,-Math.PI/2,0], scale:.55 },
               helmet({ Grey:{color:0xe0b23a}, DarkGrey:{color:0xa77a18} }, 1.05),
               { bone:'Torso', parts:L.cape, pos:[0,.55,-.42], rot:[.12,0,0], tint:{ cape:{ color:0x9aa0aa, mask:1 } } } ],
      anims:melee('Idle_swordRight','Run_swordRight') },
    giant:{ rig:'knight', height:36, measure:[{clip:'Idle_swordRight', t:0}], tint:{ Armor:{ color:0xd4c09a, mask:.75 } },
      attach:[ { bone:'PalmR', parts:P('hammer'), rot:[-1.05,0,0], scale:.8 },
               helmet({ Grey:{color:0x5d636c}, DarkGrey:{color:0x3a3f46} }, 1.12),
               { bone:'Head', parts:L.horns }, { bone:'Head', parts:L.beard },
               { bone:'UpperArmL', parts:L.pauldron, pos:[0,.32,0], rot:[Math.PI,0,0] }, { bone:'UpperArmR', parts:L.pauldron, pos:[0,.32,0], rot:[Math.PI,0,0] } ],
      anims:melee('Idle_swordRight','Walking') },
    horse:{ rig:'horse', height:14, measure:[{clip:'Idle', t:0}],
      anims:{ idle:{ frames:1, layers:[{clip:'Idle', at:0}] }, run:{ frames:6, loop:true, layers:[{clip:'Gallop'}] },
              death:{ frames:4, layers:[{clip:'Death'}] } } },
  };
}

/* Shader tweak: the per-instance colour (team colour) only paints vertices whose teamMask is set */
let MODEL_MAT = null;
function modelMaterial(){
  if(MODEL_MAT) return MODEL_MAT;
  MODEL_MAT = new THREE.MeshLambertMaterial({ vertexColors:true });
  MODEL_MAT.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float teamMask;\n' + sh.vertexShader.replace('#include <color_vertex>', [
      '#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )', '  vColor = vec3( 1.0 );', '#endif',
      '#ifdef USE_COLOR', '  vColor *= color;', '#endif',
      '#ifdef USE_INSTANCING_COLOR', '  vColor = mix( vColor, vColor * instanceColor.xyz, teamMask );', '#endif',
    ].join('\n'));
  };
  return MODEL_MAT;
}
function frameMeshes(geos, cap, shadow){
  return geos.map(g => {
    const m = new THREE.InstancedMesh(g, modelMaterial(), cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, new THREE.Color(1,1,1)); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.count = 0; m.visible = false; m.frustumCulled = false; m.castShadow = shadow; m.n = 0;
    scene.add(m); MODEL.meshes.push(m);
    return m;
  });
}

const tick = () => new Promise(r => setTimeout(r, 0));
async function loadModels(onProgress){
  const A = await BAKE.loadAll(MODEL_FILES, p => onProgress(p*.6));
  const rigs = { knight:new BAKE.Rig(A.knight), horse:new BAKE.Rig(A.horse), tank:new BAKE.Rig(A.tank) };
  const specs = modelSpecs(A);
  const mobile = Math.min(innerWidth, innerHeight) < 700;
  const keys = Object.keys(specs);
  const baked = {};
  for(let i=0;i<keys.length;i++){
    const k = keys[i];
    baked[k] = BAKE.bake(rigs[specs[k].rig], specs[k]);
    onProgress(.6 + .35*(i+1)/(keys.length+1));
    await tick();
  }
  // tank: body and turret baked separately so the turret can swivel; the gun decides which way is front
  let gunX = 0; A.tank.scene.updateMatrixWorld(true);
  A.tank.scene.traverse(o => { if(o.isMesh && /Gun/.test(o.name)){ const b=new THREE.Box3().setFromObject(o); gunX=b.getCenter(new THREE.Vector3()).x; } });
  const rotY = gunX >= 0 ? -Math.PI/2 : Math.PI/2;
  const tankSpec = (hide) => ({ rig:'tank', height:12, measure:[], rotY, hide, measureHide:null, tint:{ Main:{color:0xdfe4ea, mask:.9}, Main_Light:{color:0xf2f4f7, mask:.9}, Main_Dark:{color:0xb4bac3, mask:.8} }, anims:{ idle:{ frames:1, layers:[] } } });
  baked.tankBody = BAKE.bake(rigs.tank, tankSpec(/Turret|Gun/));
  baked.tankTurret = BAKE.bake(rigs.tank, tankSpec(/body|Track/i));
  const core = BAKE.bake(rigs.tank, tankSpec(/body|Track|Gun/i)).idle[0];
  core.computeBoundingBox();
  const c = core.boundingBox.getCenter(new THREE.Vector3());
  MODEL.pivot = new THREE.Vector3(c.x, 0, c.z);
  baked.tankTurret.idle[0].translate(-c.x, 0, -c.z);
  core.dispose();

  for(const [k, anims] of Object.entries(baked)){
    const big = k==='giant' || k==='commander' || k.startsWith('tank');
    const V = {};
    for(const [a, geos] of Object.entries(anims)) V[a] = frameMeshes(geos, MODEL_CAPS[k], !mobile || big);
    V.geo = anims;
    MODEL.V[k] = V;
  }
  MODEL.team = [new THREE.Color(0x5a86f0), new THREE.Color(0xe0533f)];
  MODEL.dead = MODEL.team.map(c => c.clone().multiplyScalar(.45));
  MODEL.ready = true;
  onProgress(1);
}

/* ---------- per-frame drawing ---------- */
const _MM = { m:new THREE.Matrix4(), t:new THREE.Matrix4(), r:new THREE.Matrix4(), q:new THREE.Quaternion(), p:new THREE.Vector3(), s:new THREE.Vector3(1,1,1), y:new THREE.Vector3(0,1,0) };
function addInst(mesh, matrix, color){
  if(mesh.n >= mesh.instanceMatrix.count) return;
  mesh.setMatrixAt(mesh.n, matrix); mesh.setColorAt(mesh.n, color); mesh.n++;
}
function pickFrame(V, u, type){
  if(!u.alive){ const d=V.death; return d[Math.min(d.length-1, Math.floor(u.dieT/.55*d.length))]; }
  if(type==='archer' && S.mode!=='plan' && !u.moving && u.target){
    if(u.atkT>0) return V.attack[2];
    return V.attack[u.cd<.6 ? 1 : 0];
  }
  if(u.atkT>0 && V.attack){ const k=1-u.atkT/ANIM[type], n=V.attack.length; return V.attack[Math.min(n-1, Math.floor(k*n))]; }
  if(u.moving && V.run){ const n=V.run.length; return V.run[((Math.floor(u.phase/TAU*n)%n)+n)%n]; }
  return (V.idle || V.ride)[0];
}
function renderModelUnits(){
  for(const m of MODEL.meshes) m.n = 0;
  const M = _MM;
  for(const u of S.units){
    const col = u.alive ? MODEL.team[u.team] : MODEL.dead[u.team];
    M.q.setFromAxisAngle(M.y, u.heading); M.p.set(u.x-W/2, u.jump||0, u.y-H/2); M.m.compose(M.p, M.q, M.s);
    if(u.type==='cavalry'){
      addInst(pickFrame(MODEL.V.horse, u, 'horse'), M.m, col);
      const R = MODEL.V.rider;
      if(u.alive){
        M.t.makeTranslation(...RIDER_OFFSET); M.r.multiplyMatrices(M.m, M.t);
        const k = u.atkT>0 ? 1-u.atkT/ANIM.cavalry : -1;
        addInst(k>=0 ? R.attack[Math.min(R.attack.length-1, Math.floor(k*R.attack.length))] : R.ride[0], M.r, col);
      } else {
        M.t.makeTranslation(7, 0, -2); M.r.multiplyMatrices(M.m, M.t);
        addInst(R.death[Math.min(R.death.length-1, Math.floor(u.dieT/.55*R.death.length))], M.r, col);
      }
    } else if(u.type==='tank'){
      addInst(MODEL.V.tankBody.idle[0], M.m, col);
      M.t.makeTranslation(MODEL.pivot.x, 0, MODEL.pivot.z); M.r.multiplyMatrices(M.m, M.t);
      M.q.setFromAxisAngle(M.y, u.aim-u.heading + (u.alive?0:.3)); M.t.makeRotationFromQuaternion(M.q);
      M.r.multiply(M.t);
      addInst(MODEL.V.tankTurret.idle[0], M.r, col);
    } else {
      const V = MODEL.V[u.type]; if(V) addInst(pickFrame(V, u, u.type), M.m, col);
    }
  }
  for(const m of MODEL.meshes){
    m.count = m.n; m.visible = m.n > 0;
    if(m.n){
      m.instanceMatrix.updateRange.count = m.n*16; m.instanceMatrix.needsUpdate = true;
      m.instanceColor.updateRange.count = m.n*3; m.instanceColor.needsUpdate = true;
    }
  }
}

/* Card icons from the baked models, tinted blue */
function tintedGeo(geo, color){
  const g = geo.clone(), c = g.attributes.color, mk = g.attributes.teamMask;
  for(let i=0;i<c.count;i++){ const k=mk.getX(i); c.setXYZ(i, c.getX(i)*(1-k+k*color.r), c.getY(i)*(1-k+k*color.g), c.getZ(i)*(1-k+k*color.b)); }
  return g;
}
function makeModelIcons(){
  const out = {};
  try{
    const r = new THREE.WebGLRenderer({ alpha:true, preserveDrawingBuffer:true });
    r.setPixelRatio(1); r.setSize(144,104,false);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff,0x667744,.8));
    const dl = new THREE.DirectionalLight(0xffffff,.7); dl.position.set(4,6,5); sc.add(dl);
    const cam = new THREE.PerspectiveCamera(26,144/104,1,4000);
    const mat = new THREE.MeshLambertMaterial({ vertexColors:true }), blue = MODEL.team[0];
    const G = k => MODEL.V[k].geo;
    const layouts = {
      soldier:[[G('soldier').idle[0],-7,-3],[G('soldier').idle[0],0,4],[G('soldier').idle[0],7,-3]],
      archer:[[G('archer').attack[1],-5,0],[G('archer').attack[1],5,3]],
      cavalry:[[G('horse').idle[0],0,0],[G('rider').ride[0],RIDER_OFFSET[0],RIDER_OFFSET[2],RIDER_OFFSET[1]]],
      giant:[[G('giant').idle[0],0,0]],
      tank:[[G('tankBody').idle[0],0,0],[G('tankTurret').idle[0],MODEL.pivot.x,MODEL.pivot.z]],
    };
    for(const t of ORDER){
      const g = new THREE.Group(), made = [];
      for(const [geo,x,z,y] of layouts[t]){ const tg=tintedGeo(geo,blue); made.push(tg); const m=new THREE.Mesh(tg,mat); m.position.set(x,y||0,z); g.add(m); }
      g.rotation.y = .55; sc.add(g); g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g), ctr = box.getCenter(new THREE.Vector3()), rad = box.getSize(new THREE.Vector3()).length()/2;
      const dist = rad/Math.sin(13*Math.PI/180);
      cam.position.set(ctr.x+dist*.2, ctr.y+dist*.25, ctr.z+dist*.95); cam.lookAt(ctr);
      r.render(sc,cam); out[t] = r.domElement.toDataURL('image/png');
      sc.remove(g); made.forEach(m=>m.dispose());
    }
    r.dispose(); if(r.forceContextLoss) r.forceContextLoss();
  }catch(e){}
  return out;
}
