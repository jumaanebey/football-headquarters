export function firstMatchLesson(deployed:boolean,called:boolean,subbed:boolean,hero = {name:'The Franchise', abilityName:'Hail Mary'}) {
 if(!deployed)return {step:1,title:`Send in ${hero.name}`,detail:'Use Deploy or select a sideline spot. Support players can follow your opening hero.'};
 if(subbed&&!called)return {step:2,title:'Try his signature in free practice',detail:'Your hero was subbed out. Finish this drive, then open Heroes to practice without spending Energy.'};
 if(!called)return {step:2,title:`Call ${hero.abilityName}`,detail:`Tap ${hero.name}’s ready signature below. Watch the release and its effect on the field.`};
 return {step:3,title:'Build on the play',detail:'Your signature is called. Send support players in and take the rival HQ or clear half its facilities to win. The result shows each hero’s contribution.'};
}
