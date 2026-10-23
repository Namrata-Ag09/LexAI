import { expect, test } from '@playwright/test'

// Minimal one-page PDF containing selectable text.
const pdf = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n' +
  '4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
  '5 0 obj<</Length 79>>stream\nBT /F1 12 Tf 50 700 Td (5. Governing Law. This Agreement is governed by the laws of New York.) Tj ET\nendstream endobj\n' +
  'trailer<</Root 1 0 R/Size 6>>\n%%EOF\n')

test('register, upload, read extracted text, see AI-not-configured guidance, log out', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Name').fill('E2E User')
  await page.getByLabel('Email').fill(`e2e${Date.now()}@example.com`)
  await page.getByLabel('Password').fill('LongPassw0rd!!')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('AI features are off')).toBeVisible()

  await page.getByRole('link', { name: 'Documents' }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'contract.pdf', mimeType: 'application/pdf', buffer: pdf })
  await expect(page.getByRole('heading', { name: 'contract' })).toBeVisible()
  await expect(page.getByText('governed by the laws of New York')).toBeVisible({ timeout: 20_000 })

  await page.getByRole('link', { name: 'Search' }).click()
  await page.getByLabel('Search query').fill('governing law')
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByRole('alert')).toContainText('GEMINI_API_KEY')

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})
