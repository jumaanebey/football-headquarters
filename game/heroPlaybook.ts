/** Coaching copy describes existing mechanics; it grants no hidden squad bonuses. */
export const HERO_PLAYBOOK: Record<string, { identity: string; timing: string; lineup: string }> = {
  qb: { identity: 'The pocket playmaker', timing: 'Use Hail Mary to break down the closest facility while your blockers hold the front.', lineup: 'Pair with linemen to protect his ranged approach.' },
  enforcer: { identity: 'The comeback runner', timing: 'Let him absorb pressure, then use Truck Stick to refill his grit and turn up the yardage.', lineup: 'Send him ahead of your ranged players.' },
  coach: { identity: 'The sideline spark', timing: 'Use Inspire when several teammates are gathered around him to boost the whole push.', lineup: 'Keep the squad close enough to share his boost.' },
  kicker: { identity: 'The long-range specialist', timing: 'Use Onside Bomb against clustered facilities to spread yardage beyond the closest target.', lineup: 'Let blockers take the pressure while he works from range.' },
  burner: { identity: 'The breakaway threat', timing: 'Jet Sweep jumps him to the closest facility. Check the defenders around it before committing.', lineup: 'Open the route with your front line first.' },
  medic: { identity: 'The drive saver', timing: 'Use Field Medic after nearby players lose grit, while they are still on their feet.', lineup: 'Keep him near the group taking the most pressure.' },
  captain: { identity: 'The pressure stopper', timing: 'Use Shield Wall before nearby teammates take heavy pressure. The protection lasts five seconds.', lineup: 'Keep your most vulnerable players inside his group.' },
  playmaker: { identity: 'The numbers advantage', timing: 'Use Trick Play when three fresh skill players can join a protected push.', lineup: 'Bring blockers so the new arrivals have room to work.' },
  legend: { identity: 'The whole-team turnaround', timing: 'Use Hall of Fame with plenty of teammates on the field and grit to recover.', lineup: 'Deploy the squad before calling his signature play.' },
};
