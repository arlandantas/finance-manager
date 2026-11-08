import { createHash } from "node:crypto";

// Gerador de PDFs SINTÉTICOS para teste (sem dado real, sem dependência). Texto Helvetica em fluxo sem
// compressão; criptografia opcional RC4 de 40 bits (security handler padrão, V1/R2) só para provar senha.

const PAD = Buffer.from("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A", "hex");
const md5 = (b: Buffer) => createHash("md5").update(b).digest();
const padPwd = (p: string) => Buffer.concat([Buffer.from(p, "latin1"), PAD]).subarray(0, 32);

function rc4(key: Buffer, data: Buffer): Buffer {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + (s[i] as number) + (key[i % key.length] as number)) & 255;
    [s[i], s[j]] = [s[j] as number, s[i] as number];
  }
  const out = Buffer.alloc(data.length);
  let a = 0;
  let b = 0;
  for (let k = 0; k < data.length; k++) {
    a = (a + 1) & 255;
    b = (b + (s[a] as number)) & 255;
    [s[a], s[b]] = [s[b] as number, s[a] as number];
    out[k] =
      (data[k] as number) ^ (s[(((s[a] as number) + (s[b] as number)) & 255) as number] as number);
  }
  return out;
}

const esc = (t: string) => t.replace(/[\\()]/g, "\\$&");

/** Uma página por grupo de linhas; `lines` em Latin-1 (acentos pt-BR). */
export function buildPdf(
  pages: string[][],
  opts: { password?: string; withText?: boolean } = {},
): Uint8Array {
  const withText = opts.withText ?? true;
  const id = md5(Buffer.from("fixture"));
  let enc: { key: Buffer; o: Buffer; u: Buffer } | null = null;
  if (opts.password !== undefined) {
    const o = rc4(md5(padPwd("owner-secret")).subarray(0, 5), padPwd(opts.password));
    const p = Buffer.alloc(4);
    p.writeInt32LE(-4);
    const key = md5(Buffer.concat([padPwd(opts.password), o, p, id])).subarray(0, 5);
    enc = { key, o, u: rc4(key, PAD) };
  }
  const objs: Buffer[] = [];
  const n = pages.length;
  // 1 catálogo, 2 páginas, 3 fonte, 4 encrypt; páginas = 5 + 2i (página) e 6 + 2i (conteúdo)
  const kids = pages.map((_, i) => `${5 + 2 * i} 0 R`).join(" ");
  objs[1] = Buffer.from("<< /Type /Catalog /Pages 2 0 R >>");
  objs[2] = Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  objs[3] = Buffer.from(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  objs[4] = Buffer.from(
    enc
      ? `<< /Filter /Standard /V 1 /R 2 /O <${enc.o.toString("hex")}> /U <${enc.u.toString("hex")}> /P -4 >>`
      : "<< >>",
  );
  pages.forEach((lines, i) => {
    const pageNo = 5 + 2 * i;
    const body = withText
      ? `BT /F1 10 Tf 12 TL 40 800 Td ${lines.map((l) => `(${esc(l)}) '`).join(" ")} ET`
      : "0 0 100 100 re f";
    let data: Buffer = Buffer.from(body, "latin1");
    if (enc) {
      const num = Buffer.from([(pageNo + 1) & 255, ((pageNo + 1) >> 8) & 255, 0, 0, 0]);
      data = rc4(md5(Buffer.concat([enc.key, num])).subarray(0, 10), data);
    }
    objs[pageNo] = Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageNo + 1} 0 R >>`,
    );
    objs[pageNo + 1] = Buffer.concat([
      Buffer.from(`<< /Length ${data.length} >>\nstream\n`),
      data,
      Buffer.from("\nendstream"),
    ]);
  });
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [];
  let pos = parts[0]?.length ?? 0;
  for (let i = 1; i < objs.length; i++) {
    const chunk = Buffer.concat([
      Buffer.from(`${i} 0 obj\n`),
      objs[i] as Buffer,
      Buffer.from("\nendobj\n"),
    ]);
    offsets[i] = pos;
    pos += chunk.length;
    parts.push(chunk);
  }
  const xref = [`xref\n0 ${objs.length}\n0000000000 65535 f \n`];
  for (let i = 1; i < objs.length; i++)
    xref.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  const hexId = id.toString("hex");
  parts.push(
    Buffer.from(
      `${xref.join("")}trailer\n<< /Size ${objs.length} /Root 1 0 R${enc ? " /Encrypt 4 0 R" : ""} /ID [<${hexId}> <${hexId}>] >>\nstartxref\n${pos}\n%%EOF\n`,
    ),
  );
  return new Uint8Array(Buffer.concat(parts));
}
