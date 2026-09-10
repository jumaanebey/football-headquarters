export function firstMatchLesson(deployed:boolean,called:boolean,subbed:boolean) {
 if(!deployed)return {step:1,title:'Send in the Franchise',detail:'Use Deploy. Your quarterback starts the drive; support players can follow.'};
 if(subbed&&!called)return {step:2,title:'Try his signature in free practice',detail:'Your hero was subbed out. Finish this drive, then open Heroes to practice without spending Energy.'};
 if(!called)return {step:2,title:'Call Hail Mary',detail:'Tap the Franchise’s ready signature below. Watch him set, throw and hit the marked target.'};
 return {step:3,title:'Build on the play',detail:'Your signature is called. Send support players in and take the rival HQ or clear half its facilities to win. The result shows each hero’s contribution.'};
}
