'use strict'

const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { stripTypeScriptTypes } = require('node:module')
const { test } = require('node:test')
const { runInNewContext } = require('node:vm')

const source = readFileSync(
  path.join(__dirname, '../supabase/functions/admin-security-test-v4/index.ts'),
  'utf8'
)
const executable = stripTypeScriptTypes(source.replace(/^import .*;$/gm, ''), { mode: 'strip' })

async function runRequest({ membership, membershipError = null, authenticated = true }) {
  const actorId = 'test-actor'
  const insertions = []
  let handleRequest

  const db = {
    from(table) {
      if (table === 'team_members') {
        return {
          select(columns) {
            assert.equal(columns, 'role_key,status')
            return {
              eq(key, value) {
                assert.equal(key, 'user_id')
                assert.equal(value, actorId)
                return { maybeSingle: async () => ({ data: membership, error: membershipError }) }
              }
            }
          }
        }
      }

      assert.equal(table, 'security_events')
      return {
        insert(event) {
          insertions.push(event)
          return {
            select: () => ({
              single: async () => ({ data: { id: 'test-event' }, error: null })
            })
          }
        }
      }
    }
  }
  const authClient = {
    auth: {
      getUser: async (token) => {
        assert.equal(token, 'test-token')
        return {
          data: { user: authenticated ? { id: actorId, app_metadata: { role: 'admin' } } : null },
          error: authenticated ? null : new Error('invalid session')
        }
      }
    }
  }
  const env = {
    SUPABASE_URL: 'https://example.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
    SUPABASE_ANON_KEY: 'mock-anon-key'
  }
  runInNewContext(executable, {
    createClient(url, key) {
      assert.equal(url, env.SUPABASE_URL)
      if (key === env.SUPABASE_ANON_KEY) return authClient
      assert.equal(key, env.SUPABASE_SERVICE_ROLE_KEY)
      return db
    },
    Deno: { env: { get: (key) => env[key] }, serve: (handler) => { handleRequest = handler } },
    Response,
    console: { error() {} }
  }, { filename: 'admin-security-test-v4/index.ts' })

  const response = await handleRequest(new Request('https://example.invalid/admin-security-test-v4', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' }
  }))
  return { status: response.status, body: await response.json(), insertions }
}

for (const { name, input, status, error } of [
  { name: 'suspended admin', input: { membership: { role_key: 'admin', status: 'suspended' } }, status: 403, error: 'Admin access required' },
  { name: 'active viewer with stale admin metadata', input: { membership: { role_key: 'viewer', status: 'active' } }, status: 403, error: 'Admin access required' },
  { name: 'missing membership', input: { membership: null }, status: 403, error: 'Admin access required' },
  { name: 'membership lookup error', input: { membership: null, membershipError: new Error('database unavailable') }, status: 503, error: 'Membership verification unavailable' },
  { name: 'invalid session', input: { authenticated: false }, status: 401, error: 'Unauthorized' }
]) {
  test(`SEC-02: ${name} cannot insert a security event`, async () => {
    const result = await runRequest(input)
    assert.equal(result.status, status)
    assert.equal(result.body.error, error)
    assert.equal(result.insertions.length, 0)
  })
}

for (const role of ['admin', 'super_admin']) {
  test(`SEC-02: active ${role} inserts one simulation event`, async () => {
    const result = await runRequest({ membership: { role_key: role, status: 'active' } })
    assert.equal(result.status, 200)
    assert.equal(result.body.event.id, 'test-event')
    assert.equal(result.insertions.length, 1)
    assert.equal(result.insertions[0].details.simulation, true)
    assert.equal(result.insertions[0].details.actor, 'test-actor')
  })
}
