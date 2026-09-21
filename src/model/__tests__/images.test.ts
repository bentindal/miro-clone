import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, MAX_IMAGE_EDGE, fitWithin, formatBytes, isImageDataUrl, isImageType, rejectImage } from '../images';
import { PIXEL_GIF } from './fixtures';
import { validateShape } from '../serialize';

describe('what counts as a picture', () => {
  it('accepts the image data URLs a browser produces', () => {
    expect(isImageDataUrl(PIXEL_GIF)).toBe(true);
    expect(isImageDataUrl('data:image/png;base64,AAAA')).toBe(true);
    expect(isImageDataUrl('data:image/svg+xml,<svg/>')).toBe(true);
  });

  // The src travels inside a board file, which is something people send each
  // other. Anything that makes opening one reach outside the file is refused.
  it('refuses anything that is not an image data URL', () => {
    for (const bad of [
      'https://example.com/cat.png',
      'http://example.com/cat.png',
      '/cat.png',
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:application/pdf;base64,AAAA',
      'DATA:IMAGE',
      '',
    ]) {
      expect(isImageDataUrl(bad), bad).toBe(false);
    }
  });

  it('refuses the same things when a board file is loaded', () => {
    const base = { type: 'image', id: 'i', parentId: null, x: 0, y: 0, w: 10, h: 10, rotation: 0 };
    expect(validateShape({ ...base, src: PIXEL_GIF })).toMatchObject({ type: 'image', src: PIXEL_GIF, alt: '' });
    for (const bad of ['https://example.com/cat.png', 'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=']) {
      expect(() => validateShape({ ...base, src: bad }), bad).toThrow(/data: URL/);
    }
    expect(() => validateShape(base)).toThrow();
  });

  it('knows which media types it can show', () => {
    expect(isImageType('image/PNG')).toBe(true);
    expect(isImageType('image/tiff')).toBe(false);
    expect(isImageType('text/plain')).toBe(false);
  });
});

describe('refusing a file', () => {
  it('lets a small image through', () => {
    expect(rejectImage({ type: 'image/png', size: 1000, name: 'cat.png' })).toBeNull();
  });

  it('says what is wrong, naming the file and the limit', () => {
    expect(rejectImage({ type: 'application/zip', size: 10, name: 'stuff.zip' })).toContain('stuff.zip');
    const big = rejectImage({ type: 'image/png', size: MAX_IMAGE_BYTES + 1, name: 'huge.png' });
    expect(big).toContain('huge.png');
    expect(big).toContain(formatBytes(MAX_IMAGE_BYTES));
  });

  it('accepts a file exactly on the limit', () => {
    expect(rejectImage({ type: 'image/png', size: MAX_IMAGE_BYTES })).toBeNull();
  });
});

describe('the size a picture arrives at', () => {
  it('keeps its own size when it already fits', () => {
    expect(fitWithin(320, 240)).toEqual({ w: 320, h: 240 });
  });

  // Blowing a small picture up only makes it blurry.
  it('never enlarges', () => {
    expect(fitWithin(20, 10)).toEqual({ w: 20, h: 10 });
  });

  it('scales a big one down keeping its shape', () => {
    const wide = fitWithin(4000, 2000);
    expect(Math.max(wide.w, wide.h)).toBe(MAX_IMAGE_EDGE);
    expect(wide.w / wide.h).toBeCloseTo(2, 1);
    const tall = fitWithin(1000, 5000);
    expect(Math.max(tall.w, tall.h)).toBe(MAX_IMAGE_EDGE);
    expect(tall.h / tall.w).toBeCloseTo(5, 1);
  });

  it('gives a zero-sized picture something to be', () => {
    expect(fitWithin(0, 0)).toEqual({ w: MAX_IMAGE_EDGE, h: MAX_IMAGE_EDGE });
  });
});
