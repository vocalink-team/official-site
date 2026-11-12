'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'team-member-invite', 'index.ts'), 'utf8')
const guard = source.match(/if \((existing\?\.role_key === 'super_admin' && callerMember\.role_key !== 'super_admin')\)\s*\{\s*return json\([^\n]+, 403\)/)
assert.ok(guard, 'SEC-01 guard must exist and return HTTP 403')

// Evaluate the exact authorization predicate extracted from the checked-in function.
// This is NOT an Edge Function integration test or a database/RLS test.
const denies = new Function('existing', 'callerMember', 'return (' + guard[1] + ')')

test('admin cannot modify an existing super_admin', () => {
  assert.equal(denies({ role_key: 'super_admin' }, { role_key: 'admin' }), true)
})
test('super_admin can modify an existing super_admin', () => {
  assert.equal(denies({ role_key: 'super_admin' }, { role_key: 'super_admin' }), false)
})
test('admin can modify an ordinary member', () => {
  assert.equal(denies({ role_key: 'viewer' }, { role_key: 'admin' }), false)
})
test('new member does not trigger existing-super-admin guard', () => {
  assert.equal(denies(null, { role_key: 'admin' }), false)
})
test('guard runs before account lookup, password reset and member updates', () => {
  const guardAt = source.indexOf("existing?.role_key === 'super_admin'")
  for (const anchor of [
    'admin.auth.admin.listUsers',
    'resetPasswordForEmail',
    "admin.from('team_members').update({ display_name",
    "admin.from('team_members').update({ user_id"
  ]) {
    assert.ok(source.indexOf(anchor) > guardAt, anchor + ' must occur after SEC-01 guard')
  }
})
test('caller must be active admin or super_admin before member changes', () => {
  assert.match(source, /callerMember\.status !== 'active'/)
  assert.match(source, /\['admin', 'super_admin'\]\.includes\(callerMember\.role_key\)/)
})
test('admin cannot assign super_admin role', () => {
  assert.match(source, /roleKey === 'super_admin' && callerMember\.role_key !== 'super_admin'/)
})
