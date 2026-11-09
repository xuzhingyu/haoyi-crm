const businessSections = new Set(['news','partners','delivery','overview','contributions','personal','executive','leads','batches','franchises','opportunities','trainings','knowledge','reports','notifications','settings']);
/** Preserve existing /workbench/#/section links after the server redirect. */
export function legacyHashTarget(hash: string): string | null {
  if (!hash.startsWith('#/')) return null;
  const [section, query = ''] = hash.slice(2).split('?');
  if (!businessSections.has(section)) return null;
  const params = new URLSearchParams(query);
  if (section === 'personal') params.set('view','business');
  return `${section === 'personal' ? '/tasks' : `/crm/${section}`}${params.size ? `?${params}` : ''}`;
}
