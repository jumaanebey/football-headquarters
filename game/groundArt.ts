/** Floorless replacements. Source URLs remain stable in saves and defense layouts;
 * only their presentation resolves to these shared, cached production atlases. */
export interface GroundArt {
  src: string;
  region?: readonly [number, number, number, number];
  /** Origin, across-field vector, lengthwise vector in the 512px sprite frame. */
  field?: readonly [number, number, number, number, number, number];
}

function atlas(src: string, originals: readonly string[]): Record<string, GroundArt> {
  return Object.fromEntries(originals.map((original, i) => [original, {
    src, region: [(i % 4) / 4, Math.floor(i / 4) / 4, 1 / 4, 1 / 4] as const,
  }]));
}

export const GROUND_ART: Record<string, GroundArt> = {
  ...atlas('/assets/buildings/upgraded-campus-cutouts.webp', [
    'film-room-3', 'film-room-5', 'headquarters-2', 'headquarters-3',
    'headquarters-4', 'headquarters-5', 'practice-field-2', 'practice-field-3',
    'practice-field-4', 'practice-field-5', 'stadium-2', 'stadium-3',
    'stadium-4', 'stadium-5', 'weight-room-3', 'weight-room-5',
  ].map(slug => `/assets/buildings/${slug}.webp`)),
  ...atlas('/assets/battle/field-equipment-cutouts.webp', [
    '/assets/buildings/rival-practice-field.webp', '/assets/buildings/rival-stadium.webp',
    ...['jugs-machine', 'jugs-machine-2', 'jugs-machine-3', 'tackling-sled',
      'tackling-sled-2', 'ref-tower', 'ref-tower-2', 'ref-tower-3',
      'tshirt-cannon', 'tshirt-cannon-2', 'tshirt-cannon-3', 'gatorade-station',
      'gatorade-station-2', 'gatorade-station-3'].map(slug => `/assets/battle/${slug}.webp`),
  ]),
  '/assets/buildings/stadium-1.webp': { src: '/assets/buildings/stadium-1-cutout.webp' },
  '/assets/decor/tailgate-tent.webp': { src: '/assets/decor/tailgate-tent-cutout.webp' },
  // The rectangular tent image is fitted into a 600px square; its original
  // 414:283 aspect occupies 410px vertically. Undo only that atlas padding.
  '/assets/decor/fan-tents.webp': {
    src: '/assets/decor/grounds-cutouts.webp', region: [0, 95 / 600, 1 / 2, 410 / 600],
  },
  '/assets/decor/tree-cluster.webp': {
    src: '/assets/decor/grounds-cutouts.webp', region: [1 / 2, 0, 1 / 2, 1],
  },
};

// Field markings are exact native paint, behind the transparent art. Keeping
// paint separate avoids baking another green floor into the stadium sprites.
GROUND_ART['/assets/buildings/stadium-2.webp'].field = [293, 231, 68, 40, -132, 76];
GROUND_ART['/assets/buildings/stadium-3.webp'].field = [289, 220, 72, 40, -132, 76];
GROUND_ART['/assets/buildings/stadium-4.webp'].field = [289, 220, 72, 40, -132, 76];
GROUND_ART['/assets/buildings/stadium-5.webp'].field = [293, 210, 72, 40, -132, 76];
GROUND_ART['/assets/buildings/rival-stadium.webp'].field = [271, 192, 111, 64, -146, 85];

// Versioned sports-equipment redesign. Keep stable film/source identities and rival facilities.
const defenseV2 = ['jugs-machine','jugs-machine-2','jugs-machine-3','tackling-sled','tackling-sled-2','ref-tower','ref-tower-2','ref-tower-3','tshirt-cannon','tshirt-cannon-2','tshirt-cannon-3','gatorade-station','gatorade-station-2','gatorade-station-3'];
defenseV2.forEach((slug,index)=>{const cell=index+2;GROUND_ART[`/assets/battle/${slug}.webp`]={src:'/assets/battle/defense-workshop-v2.png',region:[cell%4/4,Math.floor(cell/4)/4,.25,.25]};});

GROUND_ART['/assets/battle/tackling-sled-3.webp']={src:'/assets/battle/tackling-sled-elite-v2.png'};

// Trim a neighboring sled tip from the generated Ref Tower cell.
GROUND_ART['/assets/battle/ref-tower.webp'].region=[.768,.25,.232,.25];
