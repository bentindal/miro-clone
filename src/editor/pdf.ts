/**
 * A PDF writer for one job: a deck of pages, each holding a single picture.
 *
 * That is all exporting slides needs, and it is small enough to write out in
 * full: a catalogue, a page tree, and per page a content stream drawing one
 * image XObject over the whole page. Nothing here is a general PDF library,
 * and it is not meant to grow into one.
 *
 * Pixels go in as raw RGB and come out deflated, so text stays sharp; a JPEG
 * would have been two lines shorter and smeared every sticky note's edges.
 * `CompressionStream` does the deflating, which is the same zlib wrapper
 * `/FlateDecode` expects, so there is no compressor in this file.
 */

export interface PdfPage {
  /** Page size in points, at 72 to the inch. */
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  /** Three bytes per pixel, row-major from the top-left corner. */
  rgb: Uint8Array;
}

const ASCII = new TextEncoder();

/** Deflate to a zlib stream, or return the bytes as they are where that is not available. */
async function deflate(bytes: Uint8Array): Promise<{ data: Uint8Array; deflated: boolean }> {
  if (typeof CompressionStream === 'undefined') return { data: bytes, deflated: false };
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return { data: new Uint8Array(await new Response(stream).arrayBuffer()), deflated: true };
}

/** Collects the file as byte runs and remembers where each object started. */
class Writer {
  private parts: Uint8Array[] = [];
  private length = 0;
  readonly offsets: number[] = [];

  push(part: Uint8Array | string): void {
    const bytes = typeof part === 'string' ? ASCII.encode(part) : part;
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  /** Open object `n` (1-based) here and record the offset the xref table needs. */
  object(n: number, body: string): void {
    this.offsets[n] = this.length;
    this.push(`${n} 0 obj\n${body}\n`);
  }

  stream(n: number, dict: string, data: Uint8Array): void {
    this.offsets[n] = this.length;
    this.push(`${n} 0 obj\n<<${dict ? ` ${dict}` : ''} /Length ${data.length} >>\nstream\n`);
    this.push(data);
    this.push('\nendstream\nendobj\n');
  }

  get at(): number {
    return this.length;
  }

  blob(): Blob {
    return new Blob(this.parts as BlobPart[], { type: 'application/pdf' });
  }
}

export async function buildPdf(pages: PdfPage[]): Promise<Blob> {
  if (pages.length === 0) throw new Error('A PDF needs at least one page');
  for (const p of pages) {
    const expected = p.pixelWidth * p.pixelHeight * 3;
    if (p.rgb.length !== expected) throw new Error(`Page pixels do not match its size: ${p.rgb.length} bytes for ${p.pixelWidth}x${p.pixelHeight}`);
  }

  const w = new Writer();
  w.push('%PDF-1.4\n');
  // A comment of high bytes, which is how a PDF says it is not plain text.
  w.push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // 1 is the catalogue, 2 the page tree, then three objects per page.
  const pageObj = (i: number) => 3 + i * 3;
  const kids = pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ');
  w.object(1, '<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  w.object(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj`);

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const [page, contents, image] = [pageObj(i), pageObj(i) + 1, pageObj(i) + 2];
    w.object(
      page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${round(p.width)} ${round(p.height)}]` +
        ` /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${contents} 0 R >>\nendobj`,
    );
    // Scale the unit square the image is drawn in up to the whole page.
    w.stream(contents, '', ASCII.encode(`q ${round(p.width)} 0 0 ${round(p.height)} 0 0 cm /Im0 Do Q`));
    const { data, deflated } = await deflate(p.rgb);
    w.stream(
      image,
      `/Type /XObject /Subtype /Image /Width ${p.pixelWidth} /Height ${p.pixelHeight}` +
        ` /ColorSpace /DeviceRGB /BitsPerComponent 8${deflated ? ' /Filter /FlateDecode' : ''}`,
      data,
    );
  }

  const count = 3 + pages.length * 3;
  const startxref = w.at;
  w.push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) w.push(`${String(w.offsets[n]).padStart(10, '0')} 00000 n \n`);
  w.push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`);
  return w.blob();
}

/** PDF numbers do not need more than this, and trailing zeroes only add bytes. */
function round(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** The opaque RGB of a canvas, ready for `buildPdf`. */
export function rgbOf(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgb = new Uint8Array((data.length / 4) * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return rgb;
}
