/** Tema claro/escuro (US-037, SDD-010 §4.5). Parte pura: script de bootstrap e contraste WCAG. */
export const THEME_KEY = "fm:v1:theme";
export type ThemePref = "system" | "light" | "dark";

/**
 * Roda inline no `<head>`, antes da pintura: lê a preferência (por dispositivo), resolve "system" por
 * `matchMedia` e aplica `data-theme` e `color-scheme` em `<html>`. `try/catch`: sem storage => sistema.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var p="system";try{var v=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(v==="light"||v==="dark"||v==="system")p=v}catch(e){}var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var t=d?"dark":"light";var r=document.documentElement;r.setAttribute("data-theme",t);r.style.colorScheme=t}catch(e){}})();`;

export function resolveTheme(pref: ThemePref, systemDark: boolean): "light" | "dark" {
  return pref === "dark" || (pref === "system" && systemDark) ? "dark" : "light";
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? [...h].map((x) => x + x).join("") : h;
  const r = Number.parseInt(n.slice(0, 2), 16);
  const g = Number.parseInt(n.slice(2, 4), 16);
  const b = Number.parseInt(n.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Razão de contraste WCAG entre duas cores hexadecimais (1..21). */
export function contrastRatio(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x) as [number, number];
  return (a + 0.05) / (b + 0.05);
}
