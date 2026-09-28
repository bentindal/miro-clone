import { describe, expect, it } from 'vitest';
import { buildPdf, type PdfPage } from '../pdf';

function page(pixelWidth: number, pixelHeight: number, fill = 200): PdfPage {
  const rgb = new Uint8Array(pixelWidth * pixelHeight * 3);
  // A gradient rather than one flat colour, so a compressor that dropped bytes
  // would not still round-trip by luck.
  for (let i = 0; i < rgb.length; i++) rgb[i] = (fill + i) % 256;
  return { width: pixelWidth / 2, height: pixelHeight / 2, pixelWidth, pixelHeight, rgb };
}

async function bytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** The PDF as latin-1 text, which is enough to read its structure. */
function text(b: Uint8Array): string {
  return Array.from(b, (n) => String.fromCharCode(n)).join('');
}

async function inflate(b: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe('buildPdf', () => {
  it('refuses a deck with no pages, and pixels that do not match the page size', async () => {
    await expect(buildPdf([])).rejects.toThrow(/at least one page/);
    await expect(buildPdf([{ ...page(4, 4), pixelWidth: 5 }])).rejects.toThrow(/do not match/);
  });

  it('writes a header, one page object per page and a matching count', async () => {
    const pdf = text(await bytes(await buildPdf([page(8, 6), page(4, 4)])));
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf).toContain('/Count 2');
    expect(pdf.match(/\/Type \/Page[^s]/g)).toHaveLength(2);
    expect(pdf).toContain('/MediaBox [0 0 4 3]');
    expect(pdf).toContain('/MediaBox [0 0 2 2]');
    expect(pdf.endsWith('%%EOF\n')).toBe(true);
  });

  it('points every xref entry at the object it claims', async () => {
    const raw = await bytes(await buildPdf([page(8, 6), page(4, 4)]));
    const pdf = text(raw);
    const table = /xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(pdf);
    expect(table, 'no xref table').not.toBeNull();
    const count = Number(table![1]);
    expect(count).toBe(3 + 2 * 3);
    const entries = table![2].split('\n').filter(Boolean);
    expect(entries).toHaveLength(count);
    for (let n = 1; n < count; n++) {
      const offset = Number(entries[n].slice(0, 10));
      expect(pdf.slice(offset, offset + 10), `object ${n}`).toContain(`${n} 0 obj`);
    }
    // And startxref points at the table itself.
    const start = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(start, start + 4)).toBe('xref');
  });

  it('round-trips the pixels through the image stream', async () => {
    const source = page(8, 6);
    const raw = await bytes(await buildPdf([source]));
    const pdf = text(raw);
    const dict = /\/Subtype \/Image \/Width (\d+) \/Height (\d+)[^>]*?\/Length (\d+) >>\nstream\n/.exec(pdf);
    expect(dict, 'no image object').not.toBeNull();
    expect([Number(dict![1]), Number(dict![2])]).toEqual([8, 6]);
    expect(pdf).toContain('/ColorSpace /DeviceRGB');
    expect(pdf).toContain('/Filter /FlateDecode');
    const start = dict!.index + dict![0].length;
    const stored = raw.slice(start, start + Number(dict![3]));
    expect(await inflate(stored)).toEqual(source.rgb);
  });

  it('deflates a picture that has anything flat about it', async () => {
    // A board is mostly one background colour, which is why the pixels go in
    // raw rather than as a JPEG. Sixty-four white rows with a stripe through
    // them stand in for that; a few pixels of gradient would not compress at
    // all and would say nothing about a real slide.
    const flat: PdfPage = { width: 64, height: 64, pixelWidth: 64, pixelHeight: 64, rgb: new Uint8Array(64 * 64 * 3).fill(255) };
    for (let x = 0; x < 64 * 3; x++) flat.rgb[32 * 64 * 3 + x] = 0;
    const raw = await bytes(await buildPdf([flat]));
    const dict = /\/Subtype \/Image[^>]*?\/Length (\d+) >>\nstream\n/.exec(text(raw))!;
    expect(Number(dict[1])).toBeLessThan(flat.rgb.length / 20);
  });

  it('draws the image over the whole page', async () => {
    const pdf = text(await bytes(await buildPdf([{ ...page(8, 6), width: 400, height: 300 }])));
    expect(pdf).toContain('q 400 0 0 300 0 0 cm /Im0 Do Q');
  });
});
