import React from 'react';
/** Campus shell matches the room inside; saved building type and footprint stay stable. */
export function WeightRoomExterior({level,style}:{level:number;style?:React.CSSProperties}){return <svg viewBox="0 0 512 512" role="img" aria-label={`Weight Room level ${level}`} style={style}>
 <path d="M48 344 246 251 466 347 264 454Z" fill="#263940" stroke="#627d78" strokeWidth="4"/>
 <path d="M76 229 250 151 431 235V355L257 438 76 351Z" fill="#355063"/>
 <path d="M76 229 257 312V438L76 351Z" fill="#264152"/><path d="M257 312 431 235V355L257 438Z" fill="#1b303f"/>
 <path d="M59 215 250 126 450 220 257 312Z" fill={level>=4?'#ae8843':'#4a6975'} stroke="#aac0c0" strokeWidth="5"/>
 <path d="M90 215 250 141 418 220 257 294Z" fill="#2c424f"/>
 <path d="M115 208 249 148M163 234 299 174M211 256 348 199" stroke="#78919b" strokeWidth="5"/>
 {[0,1,2].map(i=><path key={i} d={`M${94+i*46} ${253+i*21}v42l31 14v-42Z`} fill="#83c3cb" stroke="#c1e7e6" strokeWidth="3"/>)}
 <path d="M282 333 326 312V400L282 421Z" fill="#6ec1ba" stroke="#a0cfca" strokeWidth="4"/><path d="M305 322V410" stroke="#315563" strokeWidth="4"/>
 <path d="M344 304 411 274V311L344 342Z" fill="#e9bb60"/>
 <text x="350" y="326" fontSize="18" fontWeight="900" fill="#183346" transform="rotate(-25 350 326)">GYM</text>
 {level>=2&&<path d="M57 363 139 402 128 425 45 385Z" fill="#b98c4b" stroke="#e1b871" strokeWidth="4"/>}
 {level>=3&&<path d="M361 379 462 328 479 350 375 403Z" fill="#337b57" stroke="#8bc7a3" strokeWidth="4"/>}
 {level>=5&&<g><path d="M257 127V52" stroke="#c7d6d5" strokeWidth="5"/><path d="M258 52 312 75 258 94Z" fill="#e8b648"/></g>}
 </svg>}
