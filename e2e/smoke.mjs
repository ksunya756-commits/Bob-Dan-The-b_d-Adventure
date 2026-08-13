import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'

const server = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'pipe' })
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:5173')
    if (response.ok) break
  } catch { /* keep polling */ }
  if (attempt === 59) { server.kill(); throw new Error('Vite did not start') }
  await new Promise(resolve => setTimeout(resolve, 250))
}

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true })
const errors = []
try {
  await mkdir('artifacts', { recursive: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.addInitScript(() => {
    window.__spokenTexts = []
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      cancel() {}, getVoices() { return [] }, speak(utterance) { window.__spokenTexts.push(utterance.text) },
    } })
  })
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'HOW TO PLAY' }).click()
  await page.getByRole('button', { name: 'GOT IT' }).click()
  await page.getByRole('button', { name: 'START GAME' }).click()

  for (let count = 1; count <= 7; count++) {
    await page.getByRole('button', { name: String(count), exact: true }).click()
    await page.getByRole('button', { name: 'NEXT' }).click()
    const inputs = page.locator('input')
    if (await inputs.count() !== count) throw new Error(`Expected ${count} inputs`)
    if (count < 7) {
      await page.getByRole('button', { name: 'BACK' }).click()
    }
  }
  const inputs = page.locator('input')
  for (let i = 0; i < 7; i++) await inputs.nth(i).fill(`Kid${i + 1}`)
  await page.getByRole('button', { name: 'START ADVENTURE' }).click()
  await page.getByRole('button', { name: 'SKIP' }).click()

  // Level 1: target alternates between b and d across the seven turns.
  await page.getByRole('button', { name: 'Listen to the instruction' }).waitFor()
  await page.getByRole('button', { name: 'Listen to the instruction' }).click()
  await page.getByRole('button', { name: 'SAVE' }).click()
  await page.getByText('GAME SAVED!').waitFor()
  for (let turn = 0; turn < 7; turn++) {
    const title = await page.locator('.task-title').textContent()
    const target = title.includes(' d') ? 'd' : 'b'
    await page.getByRole('button', { name: 'Listen to the instruction' }).click()
    const spoken = await page.evaluate(() => window.__spokenTexts.at(-1))
    if (!spoken.includes(`all ${target}`)) throw new Error(`Wrong spoken target: expected ${target}, heard ${spoken}`)
    while (await page.locator(`.letter-bubble:not(.collected)[aria-label="${target} letter"]`).count()) {
      await page.locator(`.letter-bubble:not(.collected)[aria-label="${target} letter"]`).first().click({ force: true })
      await page.waitForTimeout(80)
    }
    await page.waitForTimeout(950)
  }
  console.log('Level 1 passed')

  // Level 2: use the supported HTML drag path.
  await page.getByRole('button', { name: 'Listen to the instruction' }).waitFor()
  await page.getByRole('button', { name: 'Listen to the instruction' }).click()
  await page.waitForTimeout(1300)
  await page.screenshot({ path: 'artifacts/level-2-clean-1280x720.png' })
  for (let turn = 0; turn < 7; turn++) {
    for (let i = 0; i < 6; i++) {
      const bubble = page.locator('.drag-bubbles .letter-bubble:not(.collected)').first()
      const letter = (await bubble.textContent()).trim()
      await bubble.dragTo(page.locator(letter === 'b' ? '.bob-zone' : '.dan-zone'), { force: true })
      await page.waitForTimeout(90)
    }
    await page.waitForTimeout(950)
  }
  console.log('Level 2 passed')

  // Levels 3 and 4: use the accessible b/d controls.
  for (let level = 3; level <= 4; level++) {
    await page.getByRole('button', { name: 'Listen to the word' }).waitFor()
    await page.getByRole('button', { name: 'Listen to the word' }).click()
    for (let turn = 0; turn < 7; turn++) {
      const answer = await page.locator('.word-card .picture').getAttribute('aria-label')
      await page.getByRole('button', { name: `Choose ${answer[0]}` }).click({ force: true })
      await page.waitForTimeout(950)
    }
    console.log(`Level ${level} passed`)
  }
  await page.getByText('FINAL RESULTS').waitFor()
  if (await page.locator('.ranking > div').count() !== 7) throw new Error('Expected 7 result rows')
  await page.screenshot({ path: 'artifacts/final-1280x720.png' })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.screenshot({ path: 'artifacts/final-1920x1080.png' })
  await page.getByRole('button', { name: 'PLAY AGAIN' }).click()
  await page.getByRole('button', { name: 'NEXT' }).waitFor()

  // Saved session survives reload.
  await page.getByRole('button', { name: 'NEXT' }).click()
  await page.waitForTimeout(1300)
  const beforeReload = await page.getByText(/PLAYER:/).textContent()
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1300)
  const afterReload = await page.getByText(/PLAYER:/).textContent()
  if (beforeReload !== afterReload) throw new Error('Saved player state did not restore')

  // One-player result table renders only the selected player.
  await page.evaluate(key => {
    const saved = JSON.parse(localStorage.getItem(key))
    saved.screen = 'final'
    saved.players = [{ id: 'solo', name: 'Solo' }]
    saved.playerCount = 1
    saved.scoreByPlayerId = { solo: 12 }
    localStorage.setItem(key, JSON.stringify(saved))
  }, 'bob-and-dan-game-v1')
  await page.reload({ waitUntil: 'networkidle' })
  if (await page.locator('.ranking > div').count() !== 1) throw new Error('Expected 1 result row')
  await page.getByText('12 STARS').waitFor()
  await page.getByRole('button', { name: 'MAIN MENU' }).click()
  await page.getByText('SAVED GAMES').waitFor()
  await page.getByText('Kid1, Kid2, Kid3', { exact: false }).waitFor()
  await page.locator('.load-save').first().click()
  await page.locator('.location-jump summary').click()
  await page.getByRole('button', { name: 'LEVEL 4' }).click()
  await page.getByText('LEVEL 4', { exact: false }).first().waitFor()
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`)
  console.log('Smoke test passed: 1–7 selection, 28 turns, results, replay, reload, 1280/1920 screenshots, no browser errors.')
} finally {
  await browser.close()
  server.kill()
}
