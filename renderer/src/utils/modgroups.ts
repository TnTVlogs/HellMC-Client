// Mod dependency groups (client side), 07 §4.2 pt.2 / `docs/mod-dependency-groups`. Pure logic, no
// side effects — TS port of `app/assets/js/modgroups.js` (Node/CJS, used by `processbuilder.js` at
// launch time and by the old renderer as a `<script>` global). That file is UMD, this renderer is
// Vite ESM: no clean way to import a local CommonJS file from both a `require()` site and a Vite
// build without restructuring the whole repo's module system for one small piece of logic (same
// trade-off already made for `tokens.css`, copied and kept in sync on purpose — see 08 §11/§2.4).
// **Keep this in sync with `app/assets/js/modgroups.js` — same algorithm, same test cases
// (`test/modgroups.test.js`) — any behavior change belongs in both.**
//
// mods:  { id, required, dependencies }[]   (id = Module.id from the distribution)
// state: Map<id, boolean>  enabled flag of every OPTIONAL mod (required mods are always enabled)

export interface ModGroupMod {
  id: string
  required: boolean
  dependencies: string[]
}

export type ModGroupState = Map<string, boolean>

export interface ModGroup {
  isEnabled(state: ModGroupState, id: string): boolean
  /** Enabled mods that need `id`. If non-empty, `id` cannot be disabled. */
  blockers(state: ModGroupState, id: string): string[]
  /** Enables `id` and, recursively, everything it needs. Returns the ids whose state changed. */
  enable(state: ModGroupState, id: string): string[]
  /**
   * Disables `id`, then every dependency that no enabled mod needs any more (recursively).
   * Returns null (and changes nothing) if an enabled mod still needs `id`.
   */
  disable(state: ModGroupState, id: string): string[] | null
  /** Enables the dependencies of every enabled mod. Returns the ids that had to be forced on. */
  normalize(state: ModGroupState): string[]
}

export function build(mods: ModGroupMod[]): ModGroup {
  const byId = new Map(mods.map((m) => [m.id, m]))
  const dependents = new Map<string, string[]>(mods.map((m) => [m.id, []]))
  for (const m of mods) {
    for (const dep of m.dependencies || []) {
      if (dep !== m.id && byId.has(dep)) dependents.get(dep)!.push(m.id)
    }
  }
  const isEnabled = (state: ModGroupState, id: string): boolean => byId.get(id)!.required || state.get(id) === true
  const depsOf = (id: string): string[] => (byId.get(id)!.dependencies || []).filter((d) => d !== id && byId.has(d))

  function blockers(state: ModGroupState, id: string): string[] {
    return dependents.get(id)!.filter((d) => isEnabled(state, d))
  }

  function enable(state: ModGroupState, id: string): string[] {
    const changed: string[] = []
    const queue = [id]
    while (queue.length > 0) {
      const cur = queue.shift()!
      if (!isEnabled(state, cur)) {
        state.set(cur, true)
        changed.push(cur)
      }
      for (const dep of depsOf(cur)) if (!isEnabled(state, dep)) queue.push(dep)
    }
    return changed
  }

  function disable(state: ModGroupState, id: string): string[] | null {
    if (byId.get(id)!.required || blockers(state, id).length > 0) return null
    const changed: string[] = []
    const queue = [id]
    while (queue.length > 0) {
      const cur = queue.shift()!
      if (cur !== id && (byId.get(cur)!.required || !isEnabled(state, cur) || blockers(state, cur).length > 0)) continue
      if (isEnabled(state, cur)) {
        state.set(cur, false)
        changed.push(cur)
      }
      for (const dep of depsOf(cur)) queue.push(dep)
    }
    return changed
  }

  function normalize(state: ModGroupState): string[] {
    const forced: string[] = []
    for (const m of mods) {
      if (isEnabled(state, m.id)) forced.push(...enable(state, m.id).filter((x) => x !== m.id))
    }
    return [...new Set(forced)]
  }

  return { isEnabled, blockers, enable, disable, normalize }
}
