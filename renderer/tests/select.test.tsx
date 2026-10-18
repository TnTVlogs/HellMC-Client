import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { Select } from '../src/components/Select'

const OPTIONS = [
  { value: 'a', label: 'Alfa' },
  { value: 'b', label: 'Beta', disabled: true },
  { value: 'c', label: 'Gamma' },
  { value: 'd', label: 'Delta' }
]

function setup(value = 'a', extra: Partial<Parameters<typeof Select>[0]> = {}) {
  const onChange = vi.fn()
  render(<Select value={value} options={OPTIONS} onChange={onChange} ariaLabel="Lletra" {...extra} />)
  return { onChange, button: screen.getByRole('combobox') }
}

// Select (08 §7): patró WAI-ARIA select-only combobox.
describe('Select', () => {
  it("mostra l'etiqueta de l'opció triada i l'estat ARIA tancat", () => {
    const { button } = setup('c')
    expect(button).toHaveTextContent('Gamma')
    expect(button).toHaveAttribute('aria-haspopup', 'listbox')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it("s'obre amb Enter, mostra les opcions i marca la seleccionada", () => {
    const { button } = setup('c')
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('option')).toHaveLength(4)
    expect(screen.getByRole('option', { name: 'Gamma' })).toHaveAttribute('aria-selected', 'true')
    expect(button.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Gamma' }).id)
  })

  it('les fletxes salten les opcions desactivades i Enter tria', () => {
    const { button, onChange } = setup('a')
    fireEvent.keyDown(button, { key: 'ArrowDown' }) // obre amb «Alfa» activa
    fireEvent.keyDown(button, { key: 'ArrowDown' }) // salta «Beta» (desactivada)
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('c')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('Home/End i Esc (tanca sense canviar)', () => {
    const { button, onChange } = setup('a')
    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.keyDown(button, { key: 'End' })
    expect(screen.getByRole('option', { name: 'Delta' }).className).toContain('active')
    fireEvent.keyDown(button, { key: 'Home' })
    expect(screen.getByRole('option', { name: 'Alfa' }).className).toContain('active')
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('cerca per lletres amb la llista oberta', () => {
    const { button, onChange } = setup('a')
    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.keyDown(button, { key: 'd' })
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('d')
  })

  it('clic en una opció tria; una desactivada no', () => {
    const { button, onChange } = setup('a')
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('option', { name: 'Beta' }))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('option', { name: 'Delta' }))
    expect(onChange).toHaveBeenCalledWith('d')
  })

  it('tria la mateixa opció: no dispara onChange', () => {
    const { button, onChange } = setup('a')
    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it("desactivat: no s'obre", () => {
    const { button } = setup('a', { disabled: true })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('un clic fora tanca la llista', () => {
    const { button } = setup('a')
    fireEvent.click(button)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('sense valor coincident mostra el placeholder', () => {
    setup('zzz', { placeholder: 'Cap versió' })
    expect(screen.getByRole('combobox')).toHaveTextContent('Cap versió')
  })
})
