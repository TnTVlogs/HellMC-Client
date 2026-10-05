'use strict'
// S3/S4/S6: validacions d'entrada.
const assert = require('node:assert/strict')
const path = require('node:path')
const S = require('../app/assets/js/security')

// URLs externes: només http(s)
assert.equal(S.safeExternalUrl('https://hellmcclient.sergidalmau.dev/x'), 'https://hellmcclient.sergidalmau.dev/x')
assert.equal(S.safeExternalUrl('http://example.com'), 'http://example.com/')
for (const bad of ['file:///C:/Windows/System32/calc.exe', 'ms-msdt:/id', 'javascript:alert(1)', 'C:\\x.exe', '', null, 42, 'smb://host/share']) {
    assert.equal(S.safeExternalUrl(bad), null, String(bad))
}

// rutes: mai surten de la base
const base = path.resolve('/data/instances')
assert.equal(S.safeJoin(base, 'v1', 'mods'), path.join(base, 'v1', 'mods'))
assert.throws(() => S.safeJoin(base, '..', 'x'))
assert.throws(() => S.safeJoin(base, 'v1', '../../etc'))
assert.throws(() => S.safeJoin(base, path.resolve('/etc/passwd').replace(/^[A-Za-z]:/, '')) && S.safeJoin(base, '..'))
assert.ok(S.isInside(base, path.join(base, 'a')))
assert.ok(!S.isInside(base, path.resolve('/data/instances-evil')))

// ids
for (const ok of ['hell-1.20.1', 'v_2', 'A1']) assert.ok(S.isValidId(ok), ok)
for (const bad of ['..', '../x', 'a/b', 'a\\b', '', '.hidden', 'x'.repeat(200), null]) assert.ok(!S.isValidId(bad), String(bad))

// RAM i nom offline
assert.ok(S.isValidRam('4G') && S.isValidRam('2048M'))
for (const bad of ['4G -Dx', '0G', 'abc', '4', '', '4g', 4]) assert.ok(!S.isValidRam(bad), String(bad))
assert.ok(S.isValidOfflineName('Steve_01'))
for (const bad of ['ab', 'a b c', 'x'.repeat(17), 'Ñandú', '', null]) assert.ok(!S.isValidOfflineName(bad), String(bad))

// JVM: opcions perilloses només amb mode desenvolupador
assert.ok(S.validateJvmOptions(['-XX:+UseG1GC', '-Dfoo=bar'], false).ok)
assert.equal(S.validateJvmOptions(['-javaagent:evil.jar'], false).reason, 'dangerous-option')
assert.equal(S.validateJvmOptions(['-XX:OnOutOfMemoryError=calc'], false).reason, 'dangerous-option')
assert.ok(S.validateJvmOptions(['-javaagent:profiler.jar'], true).ok)
assert.equal(S.validateJvmOptions('nope', true).ok, false)
assert.equal(S.validateJvmOptions(['a\nb'], true).ok, false)

// patch de la UI: només claus conegudes amb el tipus correcte
assert.deepEqual(S.sanitizeUiPatch({ theme: 'dark', evil: 1, language: 'xx', uiScale: 115, __proto__: { x: 1 } }), { theme: 'dark', uiScale: 115 })
assert.deepEqual(S.sanitizeUiPatch(null), {})

// S11: feeds només https i amfitrió públic
for (const bad of ['https://localhost/x', 'https://127.0.0.1/x', 'https://192.168.1.5/rss', 'https://10.1.2.3/', 'https://172.16.0.1/', 'https://169.254.169.254/latest', 'https://[::1]/x', 'https://nas.local/feed', 'http://example.com/feed']) {
    assert.equal(S.safeFeedUrl(bad), null, bad)
}
assert.equal(S.safeFeedUrl('https://www.youtube.com/feeds/videos.xml?channel_id=x'), 'https://www.youtube.com/feeds/videos.xml?channel_id=x')
assert.ok(!S.isPrivateHost('172.32.0.1') && !S.isPrivateHost('8.8.8.8'))

console.log('security: all OK')
