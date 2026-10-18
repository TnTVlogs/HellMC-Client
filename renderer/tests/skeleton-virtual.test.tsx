import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { Skeleton, SkeletonGroup, SkeletonText } from '../src/components/Skeleton'
import { VIRTUALIZE_THRESHOLD, VirtualList, visibleRange } from '../src/components/VirtualList'

describe('Skeleton', () => {
  it('és decoratiu (aria-hidden) i accepta mides', () => {
    const { container } = render(<Skeleton width={40} height={12} />)
    const el = container.querySelector('.skeleton') as HTMLElement
    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el.style.width).toBe('40px')
  })

  it('SkeletonGroup: aria-busy i text de càrrega per a lectors de pantalla', () => {
    const { container } = render(<SkeletonGroup label="Carregant…"><SkeletonText lines={3} /></SkeletonGroup>)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Carregant…')
    expect(container.querySelectorAll('.skeleton')).toHaveLength(3)
  })
})

describe('visibleRange', () => {
  const base = { count: 1000, rowHeight: 50, offset: 0, viewport: 500, overscan: 2 }
  it('a dalt de tot', () => expect(visibleRange({ ...base, scrollTop: 0 })).toEqual([0, 12]))
  it('al mig, amb overscan', () => expect(visibleRange({ ...base, scrollTop: 5000 })).toEqual([98, 112]))
  it('no passa del final', () => expect(visibleRange({ ...base, scrollTop: 1e9 })[1]).toBe(1000))
  it('el desplaçament de la llista es descompta', () => expect(visibleRange({ ...base, offset: 300, scrollTop: 300 })).toEqual([0, 12]))
})

describe('VirtualList', () => {
  const make = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}` }))
  const row = (it: { id: string }) => <div class="row">{it.id}</div>

  it('per sota del llindar pinta tots els elements', () => {
    const { container } = render(<VirtualList items={make(VIRTUALIZE_THRESHOLD)} rowHeight={40} getKey={(i) => i.id} renderItem={row} />)
    expect(container.querySelectorAll('.row')).toHaveLength(VIRTUALIZE_THRESHOLD)
  })

  it('per sobre només en pinta una finestra, amb la mida total reservada i posició ARIA', () => {
    const { container } = render(<VirtualList items={make(5000)} rowHeight={40} getKey={(i) => i.id}
      renderItem={(it, _i, a11y) => <div class="row" {...a11y}>{it.id}</div>} />)
    const rendered = container.querySelectorAll('.row')
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered.length).toBeLessThan(100)
    expect((container.firstElementChild as HTMLElement).style.height).toBe(`${5000 * 40}px`)
    expect(rendered[0]).toHaveAttribute('aria-setsize', '5000')
    expect(rendered[0]).toHaveAttribute('aria-posinset', '1')
  })
})
