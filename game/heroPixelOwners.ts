/** Attribute connected foreground to its pose before cropping overlapping atlas bounds. */
export function heroPixelOwners(pixels: Uint8ClampedArray, width: number, height: number, bounds: readonly (readonly number[])[]) {
  const owners = new Int16Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  for (let seed = 0; seed < owners.length; seed++) {
    if (owners[seed] !== -1 || pixels[seed * 4 + 3] < 24) continue;
    let head = 0, tail = 1, x0 = width, y0 = height, x1 = 0, y1 = 0;
    queue[0] = seed; owners[seed] = -2;
    const add = (at: number) => {
      if (owners[at] === -1 && pixels[at * 4 + 3] >= 24) { owners[at] = -2; queue[tail++] = at; }
    };
    while (head < tail) {
      const at = queue[head++], x = at % width, y = Math.floor(at / width);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
      if (x > 0) add(at - 1); if (x + 1 < width) add(at + 1);
      if (y > 0) add(at - width); if (y + 1 < height) add(at + width);
    }
    let owner = 0, best = -1, distance = Infinity;
    bounds.forEach((b, frame) => {
      const overlap = Math.max(0, Math.min(x1, b[2]) - Math.max(x0, b[0])) * Math.max(0, Math.min(y1, b[3]) - Math.max(y0, b[1]));
      const d = (x0 + x1 - b[0] - b[2]) ** 2 + (y0 + y1 - b[1] - b[3]) ** 2;
      if (overlap > best || (overlap === best && d < distance)) { best = overlap; distance = d; owner = frame; }
    });
    for (let i = 0; i < tail; i++) owners[queue[i]] = owner;
  }
  return owners;
}
