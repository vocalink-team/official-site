'use strict'

const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { stripTypeScriptTypes } = require('node:module')
const path = require('node:path')
const { test } = require('node:test')
const { runInNewContext } = require('node:vm')

const functionRoot = path.join(__dirname, '../supabase/functions')
const compile = (file) => stripTypeScriptTypes(
  readFileSync(path.join(functionRoot, file), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace(/^export /gm, ''),
  { mode: 'strip' }
)
const authorization = compile('_shared/security-admin.ts')

async function call(handler, { role, status, token = 'Bearer test-token', authValid = true, lookupError = null }) {
  let serve
  const calls = []
  const env = {
    SUPABASE_URL: 'https://project.example.invalid',
    SUPABASE_ANON_KEY: 'mock-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service',
    DISCORD_SECURITY_WEBHOOK: 'https://webhook.example.invalid'
  }
  const context = {
    Deno: { serve: (fn) => { serve = fn }, env: { get: (key) => env[key] } },
    Response,
    console,
    createClient(url, key) {
      assert.equal(url, env.SUPABASE_URL)
      if (key === env.SUPABASE_ANON_KEY) {
        return { auth: { getUser: async (jwt) => {
          assert.equal(jwt, 'test-token')
          return {
            data: { user: authValid ? { id: 'actor', app_metadata: { role: 'admin' } } : null },
            error: authValid ? null : new Error('invalid JWT')
          }
        } } }
      }
      assert.equal(key, env.SUPABASE_SERVICE_ROLE_KEY)
      return { from(table) {
        assert.equal(table, 'team_members')
        return { select(columns) {
          assert.equal(columns, 'role_key,status')
          return { eq(field, value) {
            assert.equal(field, 'user_id')
            assert.equal(value, 'actor')
            return { maybeSingle: async () => ({
              data: role ? { role_key: role, status } : null,
              error: lookupError
            }) }
          } }
        } }
      } }
    },
    async fetch(url, request) {
      assert.equal(url, env.DISCORD_SECURITY_WEBHOOK)
      assert.equal(request.method, 'POST')
      calls.push(JSON.parse(request.body))
      return { ok: true }
    }
  }
  runInNewContext(authorization + '\n' + handler, context)
  const result = await serve(new Request('https://project.example.invalid', {
    method: 'POST',
    headers: token ? { Authorization: token } : {},
    body: JSON.stringify({ event: { event_type: 'ddos', severity: 'high', details: { simulation: true } } })
  }))
  return { status: result.status, calls }
}

for (const slug of ['security-alert-discord', 'security-alert-discord-v2']) {
  const handler = compile(`${slug}/index.ts`)
  for (const [label, input, expected] of [
    ['missing JWT', { token: null }, 401],
    ['invalid JWT', { authValid: false }, 401],
    ['viewer with stale admin claim', { role: 'viewer', status: 'active' }, 403],
    ['suspended admin', { role: 'admin', status: 'suspended' }, 403],
    ['missing member', {}, 403],
    ['membership lookup failure', { lookupError: new Error('database unavailable') }, 503],
    ['active admin', { role: 'admin', status: 'active' }, 200],
    ['active super admin', { role: 'super_admin', status: 'active' }, 200]
  ]) {
    test(`SEC-03 ${slug}: ${label}`, async () => {
      const result = await call(handler, input)
      assert.equal(result.status, expected)
      assert.equal(result.calls.length, expected === 200 ? 1 : 0)
      if (expected === 200) {
        assert.equal(result.calls[0].embeds[0].title, 'HIGH / ddos')
        if (slug === 'security-alert-discord') assert.match(result.calls[0].content, /Security Test Alert/)
      }
    })
  }
}
