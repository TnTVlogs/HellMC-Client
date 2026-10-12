import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evalTrack, parseCosmetic, parseEmotes } from '../src/utils/bbmodel'

// Ha de coincidir amb `Bb.java` (el que mana al joc). Es proven amb el contingut de prova de l'spike si hi és.
const assets = join(__dirname, '..', '..', '..', 'HellMC-Spike', 'assets-test')
const png = 'data:image/png;base64,iVBORw0KGgo='
const hat = JSON.stringify({
  name: 'hat', meta: { box_uv: true }, resolution: { width: 16, height: 16 }, textures: [{ source: png }],
  elements: [{ uuid: 'a', type: 'cube', from: [-4, 32, -4], to: [4, 34, 4], origin: [0, 32, 0], uv_offset: [0, 0] }],
  outliner: ['a']
})

describe('bbmodel', () => {
  it('cosmètic: posició relativa al pivot de l\'os i y cap avall', () => {
    const c = parseCosmetic(hat, 'head')
    expect(c.attach).toBe('head')
    const cube = c.root.children[0]
    expect(cube.y).toBeCloseTo(24 - 32)            // pivot del cap y=24, origen y=32 → −8 (cap amunt al joc)
    expect(cube.cubes[0]).toMatchObject({ x: -4, w: 8, h: 2, d: 8, u: 0, v: 0 })
    expect(cube.cubes[0].y).toBeCloseTo(32 - 34)
  })
  it('cosmètic: escala i desplaçament', () => {
    const c = parseCosmetic(hat, 'head', [0, 8, 0], 2)
    expect(c.root.children[0].scale).toBe(2)
    expect(c.root.children[0].y).toBeCloseTo(24 - 40)
  })
  it('rebutja models no vàlids', () => {
    expect(() => parseCosmetic(hat, 'tail')).toThrow()
    expect(() => parseCosmetic(hat, 'head', [0, 0, 0], 100)).toThrow()
    expect(() => parseCosmetic('[]')).toThrow()
    expect(() => parseCosmetic(hat.replace('"textures":[{"source":"' + png + '"}]', '"textures":[]'))).toThrow()
  })
  it('emotes: pistes mostrejades i interpolades', () => {
    const json = JSON.stringify({
      animations: [{ name: 'wave', length: 1, loop: 'loop', animators: { x: { name: 'right_arm', keyframes: [
        { channel: 'rotation', time: 0, interpolation: 'linear', data_points: [{ x: 0, y: 0, z: 0 }] },
        { channel: 'rotation', time: 1, interpolation: 'linear', data_points: [{ x: 90, y: 0, z: 0 }] }] } } }]
    })
    const [e] = parseEmotes(json)
    expect(e.period).toBe(1)
    expect(e.duration).toBe(4)
    const track = e.tracks.rightArm
    expect(track).toBeDefined()
    const mid = evalTrack(track!, 0.5, e.period)
    expect(mid[0]).toBeCloseTo((-90 * Math.PI) / 180 / 2, 1)   // rx = −rx_bb en radians (ROT_SIGN)
    expect(Number.isNaN(mid[3])).toBe(true)                    // sense canal de posició
  })
  const pirate = join(assets, 'cosmetics', 'minecraft-pirate-hat.bbmodel')
  it.skipIf(!existsSync(pirate))('el barret pirata de prova es llegeix', () => {
    const c = parseCosmetic(readFileSync(pirate, 'utf8'), 'head', [0, 32, 0], 2)
    expect(c.texW).toBeGreaterThan(0)
    expect(c.root.children.length).toBeGreaterThan(0)
  })
  const emotes = join(assets, 'emotes', 'test.bbmodel')
  it.skipIf(!existsSync(emotes))('els emotes de prova es llegeixen', () => {
    expect(parseEmotes(readFileSync(emotes, 'utf8')).length).toBe(2)
  })
})
