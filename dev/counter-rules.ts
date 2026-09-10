import {runMatchCorpus} from '../game/authority/matchCorpus';
import {replayMatch} from '../game/combat/engine';
import type {ReplayData} from '../battle';
import legacy from '../tests/fixtures/legacy-defense-films.json';
import expected from '../tests/fixtures/determinism-corpus.json';
if(import.meta.env.DEV){const matches=runMatchCorpus();const old=legacy.map(f=>replayMatch(f as ReplayData).matches);const passed=matches.every(m=>m.replayMatches&&expected.matches[m.id as keyof typeof expected.matches].hash===m.headlessHash)&&old.every(Boolean);document.getElementById('root')!.textContent=JSON.stringify({passed,current:matches.map(m=>({id:m.id,hash:m.headlessHash,replay:m.replayMatches})),legacy:old},null,2);}
