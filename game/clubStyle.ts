export const CLUB_STYLES = [
  {id:'harbor',name:'Harbor',primary:'#2563eb',secondary:'#f59e0b',mark:'H'},
  {id:'redline',name:'Redline',primary:'#b91c1c',secondary:'#fff1d6',mark:'R'},
  {id:'evergreen',name:'Evergreen',primary:'#047857',secondary:'#fde68a',mark:'E'},
  {id:'violet',name:'Night lights',primary:'#7c3aed',secondary:'#67e8f9',mark:'N'},
] as const;
export function defaultClubStyle(name:string) { let hash=0; for(const c of name) hash=(hash*31+c.charCodeAt(0))>>>0; return CLUB_STYLES[hash%CLUB_STYLES.length]; }
export function clubStyle(name:string) { try { return CLUB_STYLES.find(s=>s.id===localStorage.getItem(`fhq-style:${name}`))??defaultClubStyle(name); } catch { return defaultClubStyle(name); } }
export function clubInitials(name:string) { return name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()||'HQ'; }
