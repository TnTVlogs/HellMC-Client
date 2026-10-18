import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/preact'
import { ToastHost } from '../src/components/Toast'
import { clearToasts, MAX_TOASTS, showToast, toasts } from '../src/stores/toasts'

// Toast (08 §7): regió etiquetada, rols per urgència, tancament manual/automàtic, pausa amb ratolí.
describe('Toast', () => {
  beforeEach(() => { vi.useFakeTimers(); clearToasts() })
  afterEach(() => { vi.useRealTimers(); clearToasts() })

  it('mostra el missatge dins d\'una regió i amb role=status per als informatius', () => {
    render(<ToastHost />)
    act(() => { showToast('Adreça copiada', { tone: 'ok' }) })
    expect(screen.getByRole('region')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Adreça copiada')
  })

  it('els errors i avisos són role=alert', () => {
    render(<ToastHost />)
    act(() => { showToast('Ha fallat', { tone: 'danger' }); showToast('Compte', { tone: 'warn' }) })
    expect(screen.getAllByRole('alert')).toHaveLength(2)
  })

  it('es tanca sol passada la durada', () => {
    render(<ToastHost />)
    act(() => { showToast('Hola', { duration: 1000 }) })
    expect(screen.getByText('Hola')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1100) })
    expect(screen.queryByText('Hola')).toBeNull()
  })

  it('el ratolí a sobre atura el temporitzador i en sortir es reprèn', () => {
    render(<ToastHost />)
    act(() => { showToast('Pausa', { duration: 1000 }) })
    const el = screen.getByText('Pausa').closest('.toast') as HTMLElement
    fireEvent.mouseEnter(el)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByText('Pausa')).toBeInTheDocument()
    fireEvent.mouseLeave(el)
    act(() => { vi.advanceTimersByTime(1100) })
    expect(screen.queryByText('Pausa')).toBeNull()
  })

  it('duration 0 no es tanca sola; el botó la tanca', () => {
    render(<ToastHost />)
    act(() => { showToast('Fixa', { duration: 0 }) })
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByText('Fixa')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('Fixa')).toBeNull()
  })

  it('Esc amb el focus dins la tanca', () => {
    render(<ToastHost />)
    act(() => { showToast('Esc', { duration: 0 }) })
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Escape' })
    expect(screen.queryByText('Esc')).toBeNull()
  })

  it('limita la cua als darrers MAX_TOASTS', () => {
    for (let i = 0; i < MAX_TOASTS + 3; i++) showToast(`t${i}`, { duration: 0 })
    expect(toasts.value).toHaveLength(MAX_TOASTS)
    expect(toasts.value[0].message).toBe('t3')
  })
})
