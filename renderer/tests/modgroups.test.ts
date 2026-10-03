import { describe, expect, it } from 'vitest'
import { build, type ModGroupMod } from '../src/utils/modgroups'

// Mateixos casos que `test/modgroups.test.js` (l algorisme viu en dos llocs, 05-client.md §9).
const m = (id: string, required: boolean, dependencies: string[] = []): ModGroupMod => ({ id, required, dependencies })
const st = (o: Record<string, boolean>) => new Map(Object.entries(o))

describe('grups de dependències de mods', () => {
  it('una dependència compartida no cau fins que cau l ultim dependent', () => {
    const g = build([m('A', false, ['lib']), m('B', false, ['lib']), m('lib', false)])
    const s = st({ A: true, B: true, lib: true })
    expect(g.blockers(s, 'lib').sort()).toEqual(['A', 'B'])
    expect(g.disable(s, 'lib')).toBeNull()
    expect(g.disable(s, 'A')).toEqual(['A'])
    expect(s.get('lib')).toBe(true)
    expect(g.disable(s, 'B')?.sort()).toEqual(['B', 'lib'])
    expect(s.get('lib')).toBe(false)
    expect(g.enable(s, 'B').sort()).toEqual(['B', 'lib'])
  })

  it('cadena A→B→C: activar/desactivar arrossega tot', () => {
    const g = build([m('A', false, ['B']), m('B', false, ['C']), m('C', false)])
    const s = st({ A: false, B: false, C: false })
    expect(g.enable(s, 'A').sort()).toEqual(['A', 'B', 'C'])
    expect(g.disable(s, 'A')?.sort()).toEqual(['A', 'B', 'C'])
  })

  it('normalize força les dependències dels mods activats', () => {
    const g = build([m('A', false, ['lib']), m('lib', false)])
    const s = st({ A: true, lib: false })
    expect(g.normalize(s)).toEqual(['lib'])
    expect(s.get('lib')).toBe(true)
  })

  it('cicles no pengen i ids desconeguts s ignoren', () => {
    const cyc = build([m('A', false, ['B']), m('B', false, ['A'])])
    const s = st({ A: true, B: true })
    expect(cyc.disable(s, 'A')).toBeNull()
    s.set('B', false)
    expect(cyc.disable(s, 'A')).toEqual(['A'])
    const ghost = build([m('A', false, ['ghost'])])
    expect(ghost.disable(st({ A: true }), 'A')).toEqual(['A'])
  })
})
