/**
 * The parts of image support that have no DOM in them: what counts as an
 * acceptable picture, and how big it should arrive on the board.
 */

/**
 * The picture travels inside the board, as a data URL, rather than as a link
 * to somewhere else. That is a deliberate trade: a 2 MB photo becomes about
 * 2.7 MB of base64 in the CRDT and in every saved file, and Yjs keeps it in
 * history. In exchange a board is one self-contained thing — it works with no
 * sync server, a saved file opens anywhere, PNG export keeps working because
 * the canvas is never tainted, and opening someone's board file never fetches
 * anything. A blob store would be the answer for large media; the cap below
 * is what keeps this honest until there is one.
 */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Longest edge a dropped picture takes on the board, in world units. */
export const MAX_IMAGE_EDGE = 480;

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/svg+xml'];

export function isImageType(type: string): boolean {
  return IMAGE_TYPES.includes(type.toLowerCase());
}

/** Whether a `src` is a data URL for an image, which is the only kind accepted. */
export function isImageDataUrl(src: string): boolean {
  const m = /^data:([^;,]+)[;,]/.exec(src);
  return m !== null && isImageType(m[1]);
}

export function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Why a file cannot be put on the board, or null when it can. */
export function rejectImage(file: { type: string; size: number; name?: string }): string | null {
  if (!isImageType(file.type)) return `${file.name ? `${file.name} is` : 'That is'} not an image this board can show`;
  if (file.size > MAX_IMAGE_BYTES) {
    return `Images have to be under ${formatBytes(MAX_IMAGE_BYTES)}; ${file.name ?? 'that one'} is ${formatBytes(file.size)}`;
  }
  return null;
}

/**
 * The size a picture takes on the board: its own, unless that is bigger than
 * `max` on its longest edge, in which case it is scaled down keeping its
 * shape. A small picture is never blown up, because that only makes it blurry.
 */
export function fitWithin(w: number, h: number, max = MAX_IMAGE_EDGE): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= 0) return { w: max, h: max };
  const scale = Math.min(1, max / longest);
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}
