// Approved art optimization: preserve dimensions/poses; bake the exact runtime matte before encoding.
// Originals remain available for fallback. --check proves source hashes, dimensions and alpha.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {keyHeroPixels} from '../game/heroAnimation';
import {keyIndoorMatte} from '../game/indoorPlayers';
const check=process.argv.includes('--check');
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const sources=['art/players/indoor-atlas-v1.webp'];
for(const kind of ['elite','motion','reactions','signatures'])for(const file of await readdir(`public/assets/heroes/${kind}`))if(file.endsWith('.webp')&&!file.endsWith('.alpha.webp'))sources.push(`public/assets/heroes/${kind}/${file}`);
const records:unknown[]=[];let before=0,after=0;
const saved=check?JSON.parse(await readFile('art/player-alpha-manifest.json','utf8')):[];
for(const path of sources){
 const source=await readFile(path),target=path.replace('.webp','.alpha.webp');
 const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const pixels=new Uint8ClampedArray(data.buffer,data.byteOffset,data.byteLength);
 (path.startsWith('art/')?keyIndoorMatte:keyHeroPixels)(pixels);
 for(let i=0;i<pixels.length;i+=4)if(!pixels[i+3])pixels[i]=pixels[i+1]=pixels[i+2]=0;
 let out:Buffer;
 if(check){out=await readFile(target);const record=saved.find((r:{source:string})=>r.source===path);if(!record||record.sourceHash!==hash(source)||record.derivedHash!==hash(out))throw new Error(`Stale derived art: ${path}`)}
 else {out=await sharp(Buffer.from(pixels.buffer,pixels.byteOffset,pixels.byteLength),{raw:{width:info.width,height:info.height,channels:4}}).webp({quality:90,alphaQuality:100,effort:6,smartSubsample:true}).toBuffer();await writeFile(target,out)}
 const meta=await sharp(out).metadata();if(meta.width!==info.width||meta.height!==info.height||!meta.hasAlpha)throw new Error(`Invalid dimensions or alpha: ${target}`);
 const decoded=await sharp(out).ensureAlpha().raw().toBuffer();let alphaMismatch=0;for(let i=3;i<pixels.length;i+=4)if(decoded[i]!==pixels[i])alphaMismatch++;
 if(alphaMismatch)throw new Error(`Alpha changed at ${alphaMismatch} pixels: ${target}`);
 records.push({source:path,derived:target,sourceHash:hash(source),derivedHash:hash(out),width:meta.width,height:meta.height,quality:90,alphaMismatch,sourceBytes:source.length,derivedBytes:out.length});before+=source.length;after+=out.length;
 console.log(`${check?'PASS':'WROTE'} ${target}: ${source.length} → ${out.length}`);
}
if(!check)await writeFile('art/player-alpha-manifest.json',JSON.stringify(records,null,2)+'\n');
console.log(`Total ${(before/1048576).toFixed(2)} → ${(after/1048576).toFixed(2)} MB; all dimensions and alpha exact`);
