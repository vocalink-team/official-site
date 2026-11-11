'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('playwright')

const origin = 'http://127.0.0.1:4173'
const production = 'https://qvxoxrzvxyyribqjnpkb.supabase.co'
const isolated = 'https://ktzcjyyesyewbzvrwngx.supabase.co'
const endpoint = isolated + '/functions/v1/sec04-browser-d3eb53a41a734fbd'
const email = 'sec04-browser-d3eb53a41a734fbd@example.invalid'
const pageHtml = fs.readFileSync('request.html', 'utf8')
  .replaceAll(production, isolated)
  .replaceAll('wss://qvxoxrzvxyyribqjnpkb.supabase.co', 'wss://ktzcjyyesyewbzvrwngx.supabase.co')
  .replace('0x4AAAAAAFfEXG18WKa3BQcP', '1x00000000000000000000AA')
  .replace("'submit-service-request'", "'sec04-browser-d3eb53a41a734fbd'")
const { createHash } = require('node:crypto')
const hash = (text) => createHash('sha256').update(text).digest('base64')
const script = (html) => html.match(/<script>([\s\S]*?)<\/script>/)[1]
const html = pageHtml.replace(hash(script(fs.readFileSync('request.html', 'utf8'))), hash(script(pageHtml)))

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const errors = []
    const gatewayErrors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('requestfailed', (request) => {
      if (request.url().startsWith(endpoint) || request.url().startsWith('https://challenges.cloudflare.com/')) {
        gatewayErrors.push(new URL(request.url()).pathname + ': ' + request.failure()?.errorText)
      }
    })
    await page.route(production + '/**', (route) => route.abort())
    await page.route(isolated + '/rest/v1/analytics_events*', (route) => route.fulfill({
      status: 200, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': '*' }, body: ''
    }))
    await page.route(endpoint, (route) => {
      const headers = { ...route.request().headers() }
      delete headers.apikey
      delete headers.authorization
      return route.continue({ headers })
    })
    await page.route(origin + '/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/request.html') return route.fulfill({ status: 200, contentType: 'text/html', body: html })
      if (path === '/request-config.js') {
        return route.fulfill({ status: 200, contentType: 'text/javascript', body:
          "const supabaseClient=window.supabase.createClient('" + isolated + "','placeholder',{auth:{persistSession:false,autoRefreshToken:false}});" })
      }
      if (path === '/request.css' || path === '/vl-ui.css') return route.fulfill({ path: path.slice(1), contentType: 'text/css' })
      return route.fulfill({ status: 404, body: '' })
    })
    try {
      await page.goto(origin + '/request.html', { waitUntil: 'domcontentloaded' })
      for (let index = 1; index <= 4; index++) {
        await page.locator('#category').selectOption({ label: 'その他' })
        await page.locator('[data-next="2"]').click()
        await page.locator('#title').fill('SEC-04 browser verification ' + index)
        await page.locator('#description').fill('Synthetic browser-to-database request')
        await page.locator('[data-next="3"]').click()
        await page.locator('#name').fill('SEC-04 browser verification')
        await page.locator('#email').fill(email)
        await page.locator('#agree').check()
        await page.waitForFunction(() => Array.from(document.querySelectorAll('input[name="cf-turnstile-response"]'))
          .some((input) => input.value.length > 0), undefined, { timeout: 45000 })
        const response = page.waitForResponse((entry) => entry.url() === endpoint && entry.request().method() === 'POST')
        await page.locator('#submit').click()
        const actual = await response
        const expected = index <= 3 ? 201 : 429
        assert.equal(actual.status(), expected, JSON.stringify(await actual.json().catch(() => null)))
        await page.waitForFunction((expected) => document.querySelector('#message').textContent.includes(expected),
          index <= 3 ? '制作相談を受け付けました。' : '送信回数の上限に達しました。')
        console.log('Browser submission ' + index + ': HTTP ' + expected)
      }
      assert.deepEqual(errors, [])
    } catch (error) {
      console.error(JSON.stringify({ errors, gatewayErrors }))
      throw error
    }
  } finally {
    await browser.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
