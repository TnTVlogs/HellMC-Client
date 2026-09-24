/**
 * Mod dependency groups (client side). Pure logic: no DOM, no Electron. Usable from the renderer
 * (as a global `ModGroups`) and from Node (`require`).
 *
 * mods:  [{ id, required: boolean, dependencies: string[] }]   (id = Module.id from the distribution)
 * state: Map<id, boolean>  enabled flag of every OPTIONAL mod (required mods are always enabled)
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory()
    else root.ModGroups = factory()
})(globalThis, function () {

    function build(mods) {
        const byId = new Map(mods.map(m => [m.id, m]))
        const dependents = new Map(mods.map(m => [m.id, []]))
        for (const m of mods) {
            for (const dep of m.dependencies || []) {
                if (dep !== m.id && byId.has(dep)) dependents.get(dep).push(m.id)
            }
        }
        const isEnabled = (state, id) => byId.get(id).required || state.get(id) === true
        const depsOf = id => (byId.get(id).dependencies || []).filter(d => d !== id && byId.has(d))

        /** Enabled mods that need `id`. If non-empty, `id` cannot be disabled. */
        function blockers(state, id) {
            return dependents.get(id).filter(d => isEnabled(state, d))
        }

        /** Enables `id` and, recursively, everything it needs. Returns the ids whose state changed. */
        function enable(state, id) {
            const changed = []
            const queue = [id]
            while (queue.length > 0) {
                const cur = queue.shift()
                if (!isEnabled(state, cur)) {
                    state.set(cur, true)
                    changed.push(cur)
                }
                for (const dep of depsOf(cur)) if (!isEnabled(state, dep)) queue.push(dep)
            }
            return changed
        }

        /**
         * Disables `id`, then every dependency that no enabled mod needs any more (recursively).
         * Returns null (and changes nothing) if an enabled mod still needs `id`.
         */
        function disable(state, id) {
            if (byId.get(id).required || blockers(state, id).length > 0) return null
            const changed = []
            const queue = [id]
            while (queue.length > 0) {
                const cur = queue.shift()
                if (cur !== id && (byId.get(cur).required || !isEnabled(state, cur) || blockers(state, cur).length > 0)) continue
                if (isEnabled(state, cur)) {
                    state.set(cur, false)
                    changed.push(cur)
                }
                for (const dep of depsOf(cur)) queue.push(dep)
            }
            return changed
        }

        /** Enables the dependencies of every enabled mod. Returns the ids that had to be forced on. */
        function normalize(state) {
            const forced = []
            for (const m of mods) {
                if (isEnabled(state, m.id)) forced.push(...enable(state, m.id).filter(x => x !== m.id))
            }
            return [...new Set(forced)]
        }

        return { isEnabled, blockers, enable, disable, normalize }
    }

    return { build }
})
