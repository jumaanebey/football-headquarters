// Local-only harness: simulate reduced motion and 200% root text size, without changing OS preferences.
import motionCss from '../game-motion.css?raw';
const params = new URLSearchParams(location.search);
if (params.get('motion') === 'reduce') {
  const original = window.matchMedia.bind(window);
  window.matchMedia = (query: string) => {
    const media = original(query);
    if (query.includes('prefers-reduced-motion')) Object.defineProperty(media, 'matches', { value: true });
    return media;
  };
  const style = document.createElement('style');
  style.textContent = motionCss.split('@media (prefers-reduced-motion: reduce)').join('@media all');
  document.head.append(style);
}
if (params.get('zoom') === '200') document.documentElement.style.fontSize = '32px';
await import('../index');
