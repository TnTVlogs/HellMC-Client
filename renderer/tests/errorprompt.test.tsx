import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { overrideHellmc } from './helpers'
import { t } from '../src/i18n'
import { ErrorReportPrompt, resetErrorPrompt } from '../src/components/ErrorReportPrompt'

const report = { v: 1, kind: 'main', name: 'Boom', message: 'x', stack: '', mode: 'prompt' }
const prompt = { count: 1, report, json: JSON.stringify(report, null, 2) }

// Diàleg de fallada greu (plans/08 §3): només surt si el principal té un informe pendent; res no s'envia sense el botó.
describe('ErrorReportPrompt', () => {
  beforeEach(() => resetErrorPrompt())

  it('sense informe pendent no mostra res', async () => {
    const get = vi.fn(() => Promise.resolve(null))
    overrideHellmc('errors.getPendingPrompt', get)
    const { container } = render(<ErrorReportPrompt />)
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('mostra el diàleg, ensenya el JSON exacte i envia només en prémer el botó', async () => {
    const answer = vi.fn(() => Promise.resolve())
    overrideHellmc('errors.getPendingPrompt', () => Promise.resolve(prompt))
    overrideHellmc('errors.answerPrompt', answer)
    render(<ErrorReportPrompt />)
    await screen.findByRole('alertdialog')
    expect(answer).not.toHaveBeenCalled()
    expect(screen.queryByTestId('error-prompt-json')).toBeNull()

    fireEvent.click(screen.getByText(t('errorPrompt.show')))
    expect(screen.getByTestId('error-prompt-json').textContent).toBe(prompt.json)

    fireEvent.click(screen.getByText(t('errorPrompt.send')))
    await waitFor(() => expect(answer).toHaveBeenCalledWith('send'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('«No l\'enviïs» i «No ho tornis a preguntar» responen amb la seva opció', async () => {
    const answer = vi.fn(() => Promise.resolve())
    overrideHellmc('errors.getPendingPrompt', () => Promise.resolve(prompt))
    overrideHellmc('errors.answerPrompt', answer)
    const first = render(<ErrorReportPrompt />)
    await screen.findByRole('alertdialog')
    fireEvent.click(screen.getByText(t('errorPrompt.skip')))
    await waitFor(() => expect(answer).toHaveBeenCalledWith('dismiss'))
    first.unmount()

    resetErrorPrompt()
    render(<ErrorReportPrompt />)
    await screen.findByRole('alertdialog')
    fireEvent.click(screen.getByText(t('errorPrompt.never')))
    await waitFor(() => expect(answer).toHaveBeenCalledWith('never'))
  })
})
