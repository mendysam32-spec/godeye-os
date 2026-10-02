import { NextRequest, NextResponse } from 'next/server';
import { extractZip, zipToArrayBuffer, type ZipFileEntry } from '@/lib/zip';

export const runtime = 'nodejs';

function toText(u: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(u);
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const zipFile = form.get('zip') as File | null;
    const instructions = (form.get('instructions') as string) || '';
    const returnType = (form.get('return') as string) || 'zip'; // 'zip' | 'tree'
    const treeRaw = form.get('tree') as string | null;

    let files: ZipFileEntry[] = [];

    if (zipFile) {
      const buf = await zipFile.arrayBuffer();
      const ex = extractZip(buf);
      for (const f of ex.files) {
        files.push({
          path: f.path,
          content: f.content instanceof Uint8Array ? toText(f.content) : String(f.content),
        });
      }
    } else if (treeRaw) {
      try {
        const parsed = JSON.parse(treeRaw) as Array<{ path: string; content: string }>;
        files = parsed.map((p) => ({ path: p.path, content: p.content ?? '' }));
      } catch {}
    }

    // For now, return files as-is or repack original (AI editing happens client-side via chat)
    // but we expose endpoint to allow server-side improve later if needed
    if (returnType === 'tree') {
      return NextResponse.json({ ok: true, files });
    }

    const packed = zipToArrayBuffer(files);
    return new NextResponse(packed, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="project${instructions ? '-improved' : ''}.zip"`,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to process' }, { status: 500 });
  }
}
