/* Çöp Ordu — campaign: 30 levels across eight lands, then an endless front.
   Enemy grids are 16 columns × 8 rows (row 0 = rear, row 7 = front line). */
"use strict";
const LVL_COLS = 16, LVL_ROWS = 8;

/* when each unit joins the war (for you and for the enemy) */
const UNLOCK = { soldier:1, archer:1, cavalry:3, giant:5, atower:6, tank:8, golem:10, btower:12, catapult:14, balloon:17, dragon:21 };
/* map letters */
const UNIT_CODE = { s:'soldier', a:'archer', c:'cavalry', g:'giant', t:'tank', G:'golem', b:'balloon', d:'dragon', m:'catapult', A:'atower', B:'btower' };

/* [name, land, battle plan] */
const CAMPAIGN = [
  ['İlk Kan',            'meadow',  'tutorial1'],
  ['Ok Yağmuru',         'meadow',  'tutorial2'],
  ['Sonbahar Süvarisi',  'autumn',  'pincer'],
  ['Kum Fırtınası',      'desert',  'line'],
  ['Dev Uyanıyor',       'meadow',  'titans'],
  ['Buzlu Geçit',        'snow',    'fortress'],
  ['Kızıl Kanyon',       'canyon',  'wedge'],
  ['Çelik Paletler',     'desert',  'siege'],
  ['Yaprak Dökümü',      'autumn',  'crescent'],
  ['Taş Muhafızlar',     'swamp',   'titans'],
  ['Kar Kalesi',         'snow',    'fortress'],
  ['Kartal Yuvası',      'canyon',  'columns'],
  ['Ay Işığı',           'night',   'blitz'],
  ['Kül Ovası',          'volcano', 'siege'],
  ['Çayır Savaşı',       'meadow',  'horde'],
  ['Serap',              'desert',  'checker'],
  ['Sisli Bataklık',     'swamp',   'sky'],
  ['Çığ',                'snow',    'wedge'],
  ['Kızıl Orman',        'autumn',  'pincer'],
  ['Lav Nehri',          'volcano', 'titans'],
  ['Gece Baskını',       'night',   'sky'],
  ['Kanyon Kuşatması',   'canyon',  'fortress'],
  ['Zehirli Su',         'swamp',   'siege'],
  ['Kum Devleri',        'desert',  'titans'],
  ['Kuzey Ordusu',       'snow',    'horde'],
  ['Ateş Çemberi',       'volcano', 'crescent'],
  ['Karanlık Kale',      'night',   'fortress'],
  ['Son Hasat',          'autumn',  'blitz'],
  ['Kartalların Düşüşü', 'canyon',  'sky'],
  ['Ejderha Dağı',       'volcano', 'final'],
];
const LANDS = ['meadow','desert','autumn','snow','canyon','swamp','volcano','night'];
const LAND_NAMES = { meadow:'Çayır', desert:'Çöl', autumn:'Sonbahar', snow:'Kar', canyon:'Kanyon', swamp:'Bataklık', volcano:'Volkan', night:'Gece' };

/* enemy army value: gentle at first, steep later */
const levelBudget = n => Math.round((200 + 60*n + 10*n*n) / 10) * 10;
/* your gold relative to the enemy: generous early, then you must out-think them */
const goldRatio = n => n <= 3 ? 1.45 : Math.max(.97, 1.36 - (n-3)*.0145);

function rngFor(n){ let a = n*7919 + 13; return () => { a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

/* battle plans: which cells are filled and what role each cell plays (f front, m middle, r rear, T tower slot) */
const PLANS = {
  line:     (r,c) => r>=6 ? 'f' : r===4 && c>=2 && c<=13 ? 'm' : r===1 && c%3===1 ? 'r' : null,
  wedge:    (r,c) => Math.abs(c-7.5) <= r*.9+.5 ? (r>=5 ? 'f' : r>=2 ? 'm' : 'r') : null,
  crescent: (r,c) => { const d = Math.abs(c-7.5); return (r>=7-d*.55 && r<=8.5-d*.35) ? (d>4 ? 'f' : 'm') : (r<=1 && d<4 ? 'r' : null); },
  pincer:   (r,c) => (c<=3 || c>=12) ? (r>=3 ? 'f' : 'm') : (r<=1 ? 'r' : r===5 && c>=6 && c<=9 ? 'm' : null),
  columns:  (r,c) => c%5===2 || c%5===3 ? (r>=5 ? 'f' : r>=2 ? 'm' : 'r') : null,
  checker:  (r,c) => (r+c)%2===0 ? (r>=5 ? 'f' : r>=2 ? 'm' : 'r') : null,
  blitz:    (r,c) => (c<=2 || c>=13) && r>=2 ? 'f' : r>=5 && c>=5 && c<=10 ? 'f' : r===2 && c>=4 && c<=11 ? 'm' : null,
  horde:    (r,c) => r>=3 ? 'f' : r===1 && c>=2 && c<=13 ? 'm' : null,
  titans:   (r,c) => r===6 && c%3===1 ? 'f' : r>=4 && r<=5 && c>=3 && c<=12 ? 'm' : r===1 && c>=4 && c<=11 ? 'r' : null,
  siege:    (r,c) => r>=6 && c>=2 && c<=13 ? 'f' : r===4 && c%2===0 ? 'm' : r<=1 && c%2===1 ? 'r' : null,
  fortress: (r,c) => (r===0 && (c===1||c===14)) || (r===2 && (c===4||c===11)) ? 'T' : r===5 && c>=1 && c<=14 ? 'f' : r===3 && c>=5 && c<=10 ? 'm' : r===1 && c>=6 && c<=9 ? 'r' : null,
  sky:      (r,c) => r>=6 && c>=3 && c<=12 ? 'f' : r===3 && c%2===1 ? 'm' : r===1 && c>=4 && c<=11 ? 'r' : null,
  final:    (r,c) => r===0 && c%5===2 ? 'T' : r>=6 ? 'f' : r===4 && c>=1 && c<=14 ? 'm' : r<=2 ? 'r' : null,
};
/* what fills each role, by plan flavour (weights; locked units are skipped) */
function roleWeights(role, plan){
  const W = {
    f:{ soldier:6, cavalry:2, giant:1.2, golem:.8 },
    m:{ archer:4, giant:1, tank:1.2, balloon:1, cavalry:.6 },
    r:{ archer:2, tank:1.6, catapult:1.6, dragon:.8, balloon:.6 },
    T:{ atower:3, btower:3 },
  }[role];
  const w = Object.assign({}, W);
  if(plan==='titans'){ w.giant=(w.giant||0)+3; w.golem=(w.golem||0)+3; }
  if(plan==='blitz'){ w.cavalry=(w.cavalry||0)+5; }
  if(plan==='siege'){ w.tank=(w.tank||0)+2; w.catapult=(w.catapult||0)+3; w.btower=(w.btower||0)+1; }
  if(plan==='sky'){ w.balloon=(w.balloon||0)+3; w.dragon=(w.dragon||0)+2; w.archer=(w.archer||0)+1; }
  if(plan==='horde'){ w.soldier=(w.soldier||0)+6; }
  if(plan==='fortress' && role==='r'){ w.atower=2; w.btower=2; }
  if(plan==='final' && role==='r'){ w.dragon=(w.dragon||0)+2; w.catapult=(w.catapult||0)+1; }
  return w;
}

const TUTORIAL = {
  tutorial1: ['','','','','','','......ssss......',''],
  tutorial2: ['','','','','','.......aaa......','.....sssss......',''],
};

function designLevel(n){
  const camp = CAMPAIGN[n-1];
  const rnd = rngFor(n);
  const land = camp ? camp[1] : LANDS[(n-1) % LANDS.length];
  const planName = camp ? camp[2] : ['line','wedge','crescent','pincer','columns','checker','blitz','horde','titans','siege','fortress','sky'][Math.floor(rnd()*12)];
  const name = camp ? camp[0] : `${LAND_NAMES[land]} Cephesi`;
  let map;
  if(TUTORIAL[planName]){
    map = TUTORIAL[planName].map(r => (r || '').padEnd(LVL_COLS, '.'));
  } else {
    const plan = PLANS[planName];
    let budget = n <= 30 ? levelBudget(n) : Math.round(levelBudget(30) * (1 + (n-30)*.07));
    const grid = Array.from({ length:LVL_ROWS }, () => Array(LVL_COLS).fill('.'));
    const cells = [];
    for(let r=0;r<LVL_ROWS;r++) for(let c=0;c<LVL_COLS;c++){ const role = plan(r,c); if(role) cells.push([r, c, role, rnd()]); }
    // towers first, then the front line, then the rest
    const order = { T:0, f:1, m:2, r:3 };
    cells.sort((a,b) => order[a[2]]-order[b[2]] || (b[0]-a[0]) || (a[3]-b[3]));
    const unlocked = t => UNLOCK[t] <= n;
    const pick = w => {
      let tot = 0; const items = [];
      for(const [t, v] of Object.entries(w)) if(unlocked(t) && v > 0){ items.push([t, v]); tot += v; }
      let x = rnd()*tot; for(const [t, v] of items){ x -= v; if(x <= 0) return t; }
      return items.length ? items[items.length-1][0] : 'soldier';
    };
    const cost = t => UNITS[t].cost, letter = t => Object.keys(UNIT_CODE).find(k => UNIT_CODE[k] === t);
    for(const [r, c, role] of cells){
      let t = pick(roleWeights(role, planName));
      if(cost(t) > budget) t = role==='T' ? null : 'soldier';
      if(!t || cost(t) > budget) continue;
      grid[r][c] = letter(t); budget -= cost(t);
    }
    // spend what is left by promoting units in the plan's spirit
    const upgrades = [['s','g',UNLOCK.giant],['s','c',UNLOCK.cavalry],['a','t',UNLOCK.tank],['g','G',UNLOCK.golem],['a','m',UNLOCK.catapult],['a','d',UNLOCK.dragon]];
    for(let tries=0; tries<400 && budget>40; tries++){
      const [r, c] = cells[Math.floor(rnd()*cells.length)] || [0,0];
      const up = upgrades.find(([from, to, at]) => grid[r][c]===from && at<=n && cost(UNIT_CODE[to])-cost(UNIT_CODE[from]) <= budget);
      if(up){ budget -= cost(UNIT_CODE[up[1]]) - cost(UNIT_CODE[up[0]]); grid[r][c] = up[1]; }
    }
    map = grid.map(r => r.join(''));
  }
  return { name, land, plan:planName, map };
}
