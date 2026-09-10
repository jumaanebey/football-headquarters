/** Stable JSON encoding across browsers and jsonb object-key reordering. Array order is semantic. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item=>canonicalJson(item === undefined ? null : item)).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key=>(value as Record<string,unknown>)[key]!==undefined).map(key=>`${JSON.stringify(key)}:${canonicalJson((value as Record<string,unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
