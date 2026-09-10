import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
await mkdir('public/assets/heroes/reactions', {recursive:true});
const sources={"qb":"/Users/j.beymacbookpro/.codex/generated_images/01a088da-25ba-7050-8669-27046261a52c/exec-683fe617-935c-45dc-8684-4caf52876687.png","enforcer":"/Users/j.beymacbookpro/.codex/generated_images/01a088da-25ba-7050-8669-27046261a52c/exec-19244cd1-26a3-4175-bbd0-ebd092b474c5.png"};
for(const [key,path] of Object.entries(sources)) await sharp(path).webp({lossless:true}).toFile('public/assets/heroes/reactions/'+key+'.webp');
