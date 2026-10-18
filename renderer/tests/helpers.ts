// Utilitats comunes de les proves de components.
export const overrideHellmc = (path: string, value: unknown): void =>
  (globalThis as unknown as { __hellmcOverride: (p: string, v: unknown) => void }).__hellmcOverride(path, value)
