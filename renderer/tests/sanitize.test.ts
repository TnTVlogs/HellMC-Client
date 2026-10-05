import { describe, expect, it } from 'vitest'
import { sanitizeRichHtml } from '../src/utils/sanitize'

describe('sanitizeRichHtml (S7)', () => {
  it('treu scripts, estils, formularis i manejadors d\'esdeveniments', () => {
    const html = sanitizeRichHtml(
      '<p onclick="x()">hola</p><script>alert(1)</script><style>body{display:none}</style>' +
      '<form action="https://evil"><input name="p"></form><svg onload="x()"></svg><iframe src="https://evil"></iframe>'
    )
    expect(html).toBe('<p>hola</p>')
  })

  it('treu style, class i id (cap superposició de pantalla falsa)', () => {
    const html = sanitizeRichHtml('<div style="position:fixed;inset:0" class="dialog-host" id="x">fals</div>')
    expect(html).toBe('<div>fals</div>')
  })

  it('només enllaços https/http/mailto, amb rel segur', () => {
    const html = sanitizeRichHtml(
      '<a href="javascript:alert(1)">a</a><a href="file:///C:/x.exe">b</a><a href="ms-msdt:/id">c</a><a href="https://ok.example/x">d</a>'
    )
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('file:')
    expect(html).not.toContain('ms-msdt')
    expect(html).toContain('href="https://ok.example/x"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('només imatges https', () => {
    const html = sanitizeRichHtml('<img src="http://tracker/x.gif"><img src="data:image/png;base64,AAAA"><img src="https://ok.example/a.png">')
    expect(html).not.toContain('http://tracker')
    expect(html).not.toContain('data:image')
    expect(html).toContain('src="https://ok.example/a.png"')
  })
})
