import React, { useEffect, useRef, useState } from 'react';
import { BuildingType } from '../types';
import { BUILDING_ART_LEVELS, buildingSprite } from '../assets';
import { keyHeroPixels } from '../game/heroAnimation';
import { assetUrl } from '../game/assetUrl';
import { campusArtReady } from '../game/artGate';
import { derivedAlphaSource } from '../game/derivedArt';
import { ScenerySprite, type ScenerySpriteProps } from './ScenerySprite';

const BOUNDS: Partial<Record<BuildingType, readonly number[]>> = {
  [BuildingType.TACTICS_ROOM]: [76,136,527,560],
  [BuildingType.YOUTH_ACADEMY]: [749,137,1175,587],
  [BuildingType.MEDICAL_CENTER]: [77,717,547,1148],
  [BuildingType.TRAINING_PITCH]: [686,725,1163,1104],
};
export const isStarterFacility = (type: BuildingType, level: number) => !!BOUNDS[type] && level < BUILDING_ART_LEVELS(type)[1];
const STARTER_SHEET = '/assets/buildings/starter-campus-cutouts.webp';
let prepared: Promise<HTMLCanvasElement> | undefined;
/** The derived alpha atlas needs no keying; the original is keyed with keyHeroPixels (the facility sheet shares the hero backdrop). */
function decodeFacilities(src: string, keyed: boolean) {
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(image, 0, 0);
        if (!keyed) { const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height); keyHeroPixels(pixels.data); ctx.putImageData(pixels, 0, 0); }
        resolve(canvas);
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error('Facility art unavailable'));
    // Floorless art lets the actual turf show through, including the gaps between
    // posts and equipment. Grass-colored sprite aprons cannot match its lighting.
    campusArtReady().then(() => { image.src = assetUrl(src); });
  });
}
function loadFacilities() {
  if (!prepared) {
    const derived = derivedAlphaSource(STARTER_SHEET);
    prepared = (derived ? decodeFacilities(derived.derived, true).catch(() => decodeFacilities(STARTER_SHEET, false)) : decodeFacilities(STARTER_SHEET, false)).catch(error => { prepared = undefined; throw error; });
  }
  return prepared;
}

/** Shared campus / progression art. Later construction eras keep their own silhouettes. */
export function BuildingArt({ type, level, label = '', className = '', style }: {
  type: BuildingType; level: number; label?: string; className?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const starter = isStarterFacility(type, level);
  useEffect(() => {
    let disposed = false; setReady(false);
    if (starter) loadFacilities().then(sheet => {
      if (disposed) return;
      const ctx = ref.current?.getContext('2d'), b = BOUNDS[type];
      if (!ctx || !b) return;
      const [x, y, r, bottom] = b, w = r - x, h = bottom - y, scale = 340 / 477;
      ctx.clearRect(0, 0, 384, 384);
      ctx.drawImage(sheet, x, y, w, h, (384 - w * scale) / 2, 370 - h * scale, w * scale, h * scale);
      setReady(true);
    }).catch(() => {});
    return () => { disposed = true; };
  }, [starter, type]);
  if (!starter) return <ScenerySprite src={buildingSprite(type, level)}
    alt={label} className={className} style={style} />;
  return <span className={`relative block ${className}`} style={style}>
    <img src={buildingSprite(type, level)} alt={ready ? '' : label} draggable={false} className="block w-full h-auto select-none" style={{ visibility: ready ? 'hidden' : undefined }} />
    {starter && <canvas ref={ref} width={384} height={384} role="img" aria-label={label || undefined} data-ready={ready ? '1' : '0'}
      className="fhq-facility absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: ready ? 1 : 0 }} />}
  </span>;
}

const SPRITE_TYPES: Record<string, BuildingType> = {
  stadium: BuildingType.STADIUM, 'practice-field': BuildingType.TRAINING_PITCH,
  headquarters: BuildingType.YOUTH_ACADEMY, 'film-room': BuildingType.TACTICS_ROOM,
  'weight-room': BuildingType.MEDICAL_CENTER,
};

/** Battle layouts store URLs, not facility types. Share campus presentation for
 * those URLs so a home defense never brings back the old grass islands. */
export function BuildingSprite({ src, alt, className, style }: ScenerySpriteProps) {
  const match = /^\/assets\/buildings\/(stadium|practice-field|headquarters|film-room|weight-room)-(\d+)\.webp$/.exec(src);
  return match ? <BuildingArt type={SPRITE_TYPES[match[1]]} level={Number(match[2])}
    label={alt} className={className} style={style} />
    : <ScenerySprite src={src} alt={alt} className={className} style={style} />;
}
