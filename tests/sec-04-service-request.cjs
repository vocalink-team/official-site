'use strict'

const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { stripTypeScriptTypes } = require('node:module')
const path = require('node:path')
const { test } = require('node:test')
const { runInNewContext } = require('node:vm')

const source = readFileSync(path.join(__dirname, '../supabase/functions/submit-service-request/index.ts'), 'utf8')
const code = stripTypeScriptTypes(source.replace(/^import .*;$/gm, ''), { mode: 'strip' })
const origin = 'https://www.vocalink-team.com'
const input = {
  name: 'Requester', email: 'person@example.invalid', title: '相談',
  category: 'Webサイト制作', description: '内容', contact_method: 'email',
  urgent: false, consent: true, turnstile_token: 'test-token'
}

async function call(options = {}) {
  let handler
  const calls = { verification: 0, rpc: [] }
  runInNewContext(code, {
    Deno: { serve: (fn) => { handler = fn }, env: { get: () => 'test-configuration' } },
    Headers, Response, URL, URLSearchParams, TextEncoder, TextDecoder, AbortSignal,
    crypto: require('node:crypto').webcrypto,
    async fetch(url, request) {
      assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
      assert.equal(request.body.get('response'), 'test-token')
      calls.verification++
      return Response.json({
        success: true, hostname: 'www.vocalink-team.com', action: 'service_request',
        ...options.verification
      })
    },
    createClient() {
      return { async rpc(name, params) {
        calls.rpc.push({ name, params })
        return { data: options.allowed ?? true, error: null }
      } }
    },
    console
  })
  const request = new Request('https://example.invalid/functions/v1/submit-service-request', {
    method: 'POST',
    headers: { Origin: options.origin ?? origin, 'Content-Type': 'application/json' },
    body: options.raw ?? JSON.stringify({ ...input, ...options.body })
  })
  const response = await handler(request)
  return { status: response.status, body: await response.json(), calls }
}

test('SEC-04 valid request only sends form fields to the service-only RPC', async () => {
  const { status, body, calls } = await call({ body: { email: ' Person@example.invalid ' } })
  assert.equal(status, 201)
  assert.equal(body.ok, true)
  assert.equal(calls.verification, 1)
  assert.equal(calls.rpc.length, 1)
  const [{ name, params }] = calls.rpc
  assert.equal(name, 'submit_service_request')
  assert.equal(params.p_email_hash, require('node:crypto').createHash('sha256').update('person@example.invalid').digest('hex'))
  assert.equal(params.p_request.email, 'Person@example.invalid')
  for (const key of ['status', 'admin_note', 'created_at', 'consent', 'turnstile_token']) {
    assert.equal(Object.hasOwn(params.p_request, key), false)
  }
})

for (const [label, options, status, error] of [
  ['admin status', { body: { status: 'completed' } }, 400, 'unexpected_field'],
  ['admin note', { body: { admin_note: 'forged' } }, 400, 'unexpected_field'],
  ['forged creation time', { body: { created_at: '2026-01-01' } }, 400, 'unexpected_field'],
  ['missing verification', { body: { turnstile_token: '' } }, 403, 'verification_required'],
  ['wrong action', { verification: { action: 'recruit' } }, 403, 'verification_failed'],
  ['wrong hostname', { verification: { hostname: 'other.example.invalid' } }, 403, 'verification_failed'],
  ['wrong origin', { origin: 'https://other.example.invalid' }, 403, 'origin_not_allowed'],
  ['long description', { body: { description: 'a'.repeat(10001) } }, 400, 'invalid_input'],
  ['invalid date', { body: { deadline: '2026-02-30' } }, 400, 'invalid_input'],
  ['missing consent', { body: { consent: false } }, 400, 'invalid_input'],
  ['oversized UTF-8 body', { raw: JSON.stringify({ description: 'あ'.repeat(45000) }) }, 413, 'payload_too_large']
]) {
  test(`SEC-04 rejects ${label} before storing the request`, async () => {
    const result = await call(options)
    assert.equal(result.status, status)
    assert.equal(result.body.error, error)
    assert.equal(result.calls.rpc.length, 0)
  })
}

test('SEC-04 maps rate-limit rejection to HTTP 429', async () => {
  const result = await call({ allowed: false })
  assert.equal(result.status, 429)
  assert.equal(result.calls.rpc.length, 1)
})
