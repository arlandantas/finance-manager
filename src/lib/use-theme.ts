"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { resolveTheme, THEME_KEY, type ThemePref } from "@/lib/theme";

const listeners = new Set<() => void>();
const memory: { pref: ThemePref | null } = { pref: null };

function read(): ThemePref {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // sem storage: memória da sessão
  }
  return memory.pref ?? "system";
}

function apply(pref: ThemePref) {
  const t = resolveTheme(pref, window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", t);
  document.documentElement.style.colorScheme = t;
}

/** Preferência de tema por dispositivo (não por usuário): aplica na hora, persiste e segue o sistema. */
export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const pref = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    read,
    () => "system" as ThemePref,
  );
  useEffect(() => {
    apply(pref);
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [pref]);
  const set = useCallback((p: ThemePref) => {
    memory.pref = p;
    try {
      window.localStorage.setItem(THEME_KEY, p);
    } catch {
      // vale só na sessão
    }
    apply(p);
    for (const l of listeners) l();
  }, []);
  return [pref, set];
}
