'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const original = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/team-member-invite/index.ts'), 'utf8')
const runnable = original
  .replace(/^import \{ createClient \} from 'npm:@supabase\/supabase-js@2'\s*/m, '')
  .replace(/function json\(body: unknown, status = 200\)/, 'function json(body, status = 200)')
  .replace(/const inviteOptions: Record<string, unknown> =/, 'const inviteOptions =')

async function requestCase(callerRole, targetRole, callerStatus = 'active') {
  let handler
  const calls = { reset: 0, update: 0, listUsers: 0, invite: 0 }
  const callerId = 'caller-id'
  const targetEmail = 'target@example.invalid'
  const existing = targetRole ? {
    id: 'target-id', user_id: 'target-user-id', status: 'active',
    display_name: 'Target', role_key: targetRole, department: 'general'
  } : null
  const query = (table) => ({
    select: () => ({
      eq: (key, value) => ({
        maybeSingle: async () => ({
          data: table === 'team_members'
            ? (key === 'user_id' && value === callerId
              ? { id: 'caller-member-id', role_key: callerRole, status: callerStatus }
              : existing)
            : { role_key: value },
          error: null
        })
      })
    }),
    update: () => { calls.update++; return { eq: async () => ({ error: null }) } },
    insert: async () => ({ error: null })
  })
  const admin = {
    from: query,
    auth: { admin: {
      listUsers: async () => { calls.listUsers++; return { data: { users: [] }, error: null } },
      inviteUserByEmail: async () => { calls.invite++; return { data: { user: { id: 'new-id' } }, error: null } }
    } }
  }
  const caller = {
    auth: {
      getUser: async () => ({ data: { user: { id: callerId } }, error: null }),
      resetPasswordForEmail: async () => { calls.reset++; return { error: null } }
    }
  }
  let clients = 0
  const createClient = () => (++clients === 1 ? admin : caller)
  const context = {
    createClient, Deno: { env: { get: () => 'mock' }, serve: fn => { handler = fn } },
    Response, console, Date
  }
  vm.runInNewContext(runnable, context, { filename: 'team-member-invite/index.ts' })
  const req = new Request('https://example.invalid/team-member-invite', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: targetEmail, display_name: 'Target',
      role_key: targetRole === 'super_admin' ? 'viewer' : 'viewer'
    })
  })
  const response = await handler(req)
  return { status: response.status, body: await response.json(), calls }
}

test('SEC-01: admin changing existing super_admin gets 403 without side effects', async () => {
  const r = await requestCase('admin', 'super_admin')
  assert.equal(r.status, 403)
  assert.deepEqual(r.calls, { reset: 0, update: 0, listUsers: 0, invite: 0 })
})
test('SEC-01: super_admin may proceed to existing super_admin update', async () => {
  const r = await requestCase('super_admin', 'super_admin')
  assert.equal(r.status, 200)
  assert.equal(r.calls.update, 1)
})
test('SEC-01: admin may proceed to ordinary member update', async () => {
  const r = await requestCase('admin', 'viewer')
  assert.equal(r.status, 200)
  assert.equal(r.calls.update, 1)
})
test('SEC-01: suspended admin cannot change ordinary member', async () => {
  const r = await requestCase('admin', 'viewer', 'suspended')
  assert.equal(r.status, 403)
  assert.equal(r.calls.update, 0)
})
