'use strict'
// Estructura del procés principal (`index.js` + `src-node/main/*.js`): sense dependències circulars entre mòduls, cada nom importat existeix
// a l'export del mòdul d'origen, i ningú reassigna una constant importada. Són els errors típics en partir un fitxer gran en mòduls, i només
// apareixen en executar un camí concret de l'aplicació; aquí es detecten sense arrencar Electron.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

let parser
let traverse
try {
    parser = require('@babel/parser')
    traverse = require('@babel/traverse').default
} catch {
    console.log('mainmodules: SALTAT (cal @babel/parser i @babel/traverse)')
    process.exit(0)
}

const root = path.join(__dirname, '..')
const dir = path.join(root, 'src-node', 'main')
const files = { index: path.join(root, 'index.js') }
for (const f of fs.readdirSync(dir)) if (f.endsWith('.js')) files[f.slice(0, -3)] = path.join(dir, f)

const parse = (file) => parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'script', allowReturnOutsideFunction: true })
const moduleOf = (value) => {
    const m = /^(?:\.\/src-node\/main|\.)\/([a-z]+)$/.exec(value)
    return m && m[1] in files && m[1] !== 'index' ? m[1] : null
}

const exportsOf = {}
const requires = {} // mòdul → mòduls que carrega
const imports = [] // { from, module, name }
const constViolations = []

for (const [name, file] of Object.entries(files)) {
    const ast = parse(file)
    requires[name] = new Set()
    for (const s of ast.program.body) {
        const e = s.type === 'ExpressionStatement' ? s.expression : null
        if (e?.type === 'AssignmentExpression' && e.left.type === 'MemberExpression' && e.left.object.name === 'module' && e.right.type === 'ObjectExpression') {
            exportsOf[name] = e.right.properties.map((p) => p.key.name)
        }
    }
    traverse(ast, {
        CallExpression(p) {
            const c = p.node
            if (c.callee.type !== 'Identifier' || c.callee.name !== 'require' || c.arguments[0]?.type !== 'StringLiteral') return
            const target = moduleOf(c.arguments[0].value)
            if (!target) return
            requires[name].add(target)
            const decl = p.parent
            if (decl.type === 'VariableDeclarator' && decl.id.type === 'ObjectPattern') {
                for (const prop of decl.id.properties) imports.push({ from: name, module: target, name: prop.key.name })
            }
        },
        Program(p) {
            for (const [binding, b] of Object.entries(p.scope.bindings)) {
                if (b.path.parent.type === 'VariableDeclaration' && b.path.parent.kind === 'const' && b.constantViolations.length) constViolations.push(`${name}: ${binding}`)
            }
        }
    })
}

// 1) cada import existeix a l'export
for (const i of imports) {
    assert.ok((exportsOf[i.module] ?? []).includes(i.name), `${i.from} importa «${i.name}» de ${i.module}, que no ho exporta`)
}

// 2) cap constant importada (o local) es reassigna
assert.deepEqual(constViolations, [], `constants reassignades: ${constViolations.join(', ')}`)

// 3) sense cicles
const visiting = new Set()
const done = new Set()
function visit(node, chain) {
    if (done.has(node)) return
    assert.ok(!visiting.has(node), `dependència circular: ${[...chain, node].join(' → ')}`)
    visiting.add(node)
    for (const next of requires[node] ?? []) visit(next, [...chain, node])
    visiting.delete(node)
    done.add(node)
}
for (const name of Object.keys(files)) visit(name, [])

// 4) `core` no depèn de cap altre mòdul de domini (és la base)
assert.deepEqual([...requires.core], [], 'core ha de ser la base: no pot carregar cap altre mòdul')

console.log(`mainmodules: all OK (${Object.keys(files).length} fitxers, ${imports.length} imports)`)
