/** Controles C0/C1 e caracteres invisíveis/de direção (U+200B-200F, U+2028-202E, U+2066-2069, U+FEFF). */
export function isHiddenChar(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0xfeff
  );
}
