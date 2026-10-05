"use client";

/**
 * Preferências de exibição por usuário e dispositivo (SDD-010 §1, §2). Nunca guarda dado financeiro.
 * Armazenamento em `localStorage` com `try/catch` em toda leitura/escrita e fallback em memória
 * (cenário "navegador não permite guardar"). Sem `userId` (fora do provedor) usa a chave "anon".
 */
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";

export type UserPrefKey = "hideValues" | "balancesExpanded";
export const DEFAULT_USER_PREFS = { hideValues: true, balancesExpanded: false } as const;
export const THEME_KEY = "fm:v1:theme";
export const prefKey = (userId: string, k: UserPrefKey) => `fm:v1:u:${userId}:${k}`;

// Todas as preferências atuais são booleanas.
type PrefValue<_K extends UserPrefKey> = boolean;

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Lê o texto salvo; erro de storage (ou ausência) cai para a memória da sessão. */
function readRaw(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    // storage indisponível: segue para a memória
  }
  return memory.get(key) ?? null;
}

function writeRaw(key: string, value: string) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // sem storage: vale só na sessão (memória)
  }
}

export function readPref<K extends UserPrefKey>(userId: string, k: K): PrefValue<K> {
  const raw = readRaw(prefKey(userId, k));
  if (raw === "true") return true as PrefValue<K>;
  if (raw === "false") return false as PrefValue<K>;
  return DEFAULT_USER_PREFS[k] as PrefValue<K>;
}

export function writePref<K extends UserPrefKey>(userId: string, k: K, v: PrefValue<K>) {
  writeRaw(prefKey(userId, k), String(v));
  emit();
}

/** Só para testes: zera a memória e avisa os assinantes. */
export function resetPrefsMemory() {
  memory.clear();
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

const UserIdContext = createContext<string>("anon");

export function PrefsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  return createElement(UserIdContext.Provider, { value: userId }, children);
}

/** `useSyncExternalStore`: o snapshot de servidor é sempre o padrão (valores ocultos, sem flash). */
export function usePref<K extends UserPrefKey>(k: K): [PrefValue<K>, (v: PrefValue<K>) => void] {
  const userId = useContext(UserIdContext);
  const value = useSyncExternalStore(
    subscribe,
    () => readPref(userId, k),
    () => DEFAULT_USER_PREFS[k] as PrefValue<K>,
  );
  const set = useCallback((v: PrefValue<K>) => writePref(userId, k, v), [userId, k]);
  return [value, set];
}
