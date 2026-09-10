import {KitLayer} from './TeamKit';
import type {TeamKit} from '../game/teamKit';
import { HERO_FOOT_OFFSET } from '../game/heroFootOffsets';
import React, { useState } from 'react';
import { assetUrl } from '../game/assetUrl';

export const WALK_FRAMES = ['walkA', 'walkC', 'walkB', 'walkD'] as const;

interface Props {
  sources: string[];
  kit?: TeamKit;
  duration?: number;
  style?: React.CSSProperties;
}

/** A complete pose sequence replaces the portrait atomically. A failed frame
 * keeps the portrait visible; changing walk/action resets readiness immediately. */
export function SpriteFrames(props: Props) {
  return <FrameSequence key={props.sources.join('|')} {...props} />;
}

function FrameSequence({ sources, duration = 0.42, style, kit }: Props) {
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());
  const [failed, setFailed] = useState(false);
  const ready = !failed && sources.length > 0 && loaded.size === sources.length;
  return <span className="fhq-frame-sequence absolute inset-0 pointer-events-none" data-ready={ready ? '1' : '0'} style={{ visibility: ready ? 'visible' : 'hidden' }}>
    {sources.map((src, i) => <React.Fragment key={src}><img key={src} src={assetUrl(src)} alt="" draggable={false}
      onLoad={() => setLoaded(previous => new Set(previous).add(i))}
      onError={() => setFailed(true)}
      className="fhq-rigframe absolute inset-0 w-full h-full object-contain select-none"
      style={{ ...style, top: `${HERO_FOOT_OFFSET[src] ?? 0}%`, animation: sources.length > 1 ? `fhq-q${i + 1} ${duration}s steps(1, end) infinite` : undefined }} /><KitLayer src={src} kit={kit} className="fhq-rigframe" style={{...style,top:`${HERO_FOOT_OFFSET[src]??0}%`,animation:sources.length>1?`fhq-q${i+1} ${duration}s steps(1, end) infinite`:undefined}} /></React.Fragment>)}
  </span>;
}
