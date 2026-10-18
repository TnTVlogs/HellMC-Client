import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/preact'
import { Tooltip } from '../src/components/Tooltip'
import { IconButton } from '../src/components/IconButton'

describe('Tooltip', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it("en enfocar amb teclat surt a l'instant i el fill rep aria-describedby", () => {
    render(<Tooltip content="Ajuda"><button type="button">Obre</button></Tooltip>)
    const btn = screen.getByRole('button', { name: 'Obre' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.focus(btn)
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Ajuda')
    expect(btn).toHaveAttribute('aria-describedby', tip.id)
  })

  it('amb el ratolí surt amb retard', () => {
    render(<Tooltip content="Ajuda" delay={400}><button type="button">Obre</button></Tooltip>)
    const wrap = screen.getByRole('button').parentElement as HTMLElement
    fireEvent.mouseEnter(wrap)
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => { vi.advanceTimersByTime(450) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.mouseLeave(wrap)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('Esc el tanca', () => {
    render(<Tooltip content="Ajuda"><button type="button">Obre</button></Tooltip>)
    fireEvent.focus(screen.getByRole('button'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('sense contingut no fa res', () => {
    render(<Tooltip content=""><button type="button">Obre</button></Tooltip>)
    fireEvent.focus(screen.getByRole('button'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('IconButton: etiqueta accessible i cap title natiu', () => {
    render(<IconButton label="Actualitza">x</IconButton>)
    const btn = screen.getByRole('button', { name: 'Actualitza' })
    expect(btn).not.toHaveAttribute('title')
    fireEvent.focus(btn)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Actualitza')
  })
})
