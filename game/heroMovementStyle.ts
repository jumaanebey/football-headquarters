/** Cosmetic profiles only. No values here change simulation distance, damage or timing. */
export interface HeroMovementStyle {
  lift: number; breath: number; cadence: number; plant: number; settle: number;
  lean: number; compression: number; attackLean: number; recovery: number;
  travel: number; rest: number; identity: string;
}
export const HERO_MOVEMENT_STYLE: Record<string, HeroMovementStyle> = {
  qb: {lift:2,breath:2.8,cadence:1,plant:.10,settle:.16,lean:.014,compression:.012,attackLean:.025,recovery:.24,travel:5.8,rest:2.4,identity:'Composed stride · planted release'},
  enforcer: {lift:1,breath:3.4,cadence:1.16,plant:.10,settle:.16,lean:.045,compression:.035,attackLean:.075,recovery:.32,travel:6.1,rest:2.8,identity:'Short drive steps · heavy contact'},
  coach: {lift:.5,breath:3.6,cadence:.8,plant:.14,settle:.18,lean:.005,compression:.006,attackLean:.014,recovery:.3,travel:7.7,rest:3.2,identity:'Measured steps · deliberate direction'},
  kicker: {lift:2.5,breath:3.1,cadence:.94,plant:.16,settle:.18,lean:.02,compression:.014,attackLean:-.035,recovery:.28,travel:6.4,rest:2.6,identity:'Approach and plant · upright recovery'},
  burner: {lift:3,breath:2.1,cadence:1.32,plant:.06,settle:.1,lean:.055,compression:.012,attackLean:.045,recovery:.16,travel:4.2,rest:1.7,identity:'Quick turnover · sharp stop'},
  medic: {lift:.8,breath:2.9,cadence:1.05,plant:.11,settle:.18,lean:.018,compression:.01,attackLean:.04,recovery:.26,travel:5.9,rest:2.3,identity:'Purposeful pace · forward treatment stance'},
  captain: {lift:.5,breath:3.8,cadence:.86,plant:.15,settle:.19,lean:.025,compression:.026,attackLean:.052,recovery:.34,travel:7.1,rest:3,identity:'Braced posture · measured turns'},
  playmaker: {lift:2,breath:2.5,cadence:1.22,plant:.07,settle:.12,lean:.04,compression:.018,attackLean:-.025,recovery:.18,travel:4.8,rest:1.9,identity:'Agile cadence · quick cuts'},
  legend: {lift:1,breath:4.2,cadence:.76,plant:.17,settle:.19,lean:.012,compression:.018,attackLean:.06,recovery:.38,travel:8.2,rest:3.5,identity:'Deliberate stride · long preparation'},
};
export const heroMovementStyle = (key: string): HeroMovementStyle => HERO_MOVEMENT_STYLE[key] ?? HERO_MOVEMENT_STYLE.qb;
/** Plant the feet through a stride, changing posture around a fixed ground anchor. */
export function heroLocomotionPose(key: string, mode: string, phase: number, actionSeconds = 0, reduced = false) {
  if (reduced) return {lean:0,scaleY:1};
  const p=heroMovementStyle(key);
  if(mode==='walk') {
    const contact=(1+Math.cos(phase*Math.PI*4))/2;
    return {lean:p.lean,scaleY:1-p.compression*contact};
  }
  if(mode==='attack') {
    const weight=Math.max(0,1-Math.abs(actionSeconds-p.recovery*.45)/p.recovery);
    return {lean:p.attackLean*weight,scaleY:1-p.compression*weight};
  }
  return {lean:0,scaleY:1};
}
