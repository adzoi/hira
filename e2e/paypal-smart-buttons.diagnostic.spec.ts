/// <reference types="node" />
import * as fs from "fs/promises"
import * as path from "path"
import { expect, test, type Page } from "@playwright/test"

const BUYER_EMAIL = process.env.PAYPAL_SANDBOX_BUYER_EMAIL ?? process.env.PAYPAL_SANDBOX_EMAIL ?? ""
const BUYER_PASSWORD = process.env.PAYPAL_SANDBOX_BUYER_PASSWORD ?? process.env.PAYPAL_SANDBOX_PASSWORD ?? ""

type FailureSignals = {
  browserLines: string[]
  paypalRequestUrls: string[]
  paypalSdkScriptCountInitial: number
  paypalSdkScriptCountAfterOpen: number
  paypalIframeCount: number
  buyerAccessTokenError: boolean
  onApproveHit: boolean
  captureResolved: boolean
  captureRejected: boolean
  vipSuccessLog: boolean
  unmountAfterOnApprove: boolean
  mainNavigationsDuringFlow: string[]
  duplicateSdkInjection: boolean
}

function indexAfter(haystack: string[], needle: string): number {
  const i = haystack.findIndex((line) => line.includes(needle))
  return i
}

function classifyFailure(s: FailureSignals): string {
  const lines = s.browserLines.join("\n")
  if (s.buyerAccessTokenError || /Buyer access token not present/i.test(lines)) {
    if (s.unmountAfterOnApprove) {
      return "A) Component remount issue — PayPalButtons unmounted after ONAPPROVE_HIT (lifecycle dropped buyer session)."
    }
    if (s.duplicateSdkInjection) {
      return "B) SDK reload / duplicate injection — more than one PayPal JS SDK script tag while flow ran."
    }
    if (s.mainNavigationsDuringFlow.length > 0) {
      return `C) Route / navigation interference — main window navigated during approval: ${s.mainNavigationsDuringFlow.join(" | ")}`
    }
    return "D) Sandbox session loss / SDK timing — no unmount or duplicate SDK detected; token not bound to capture (popup/session race or PayPal sandbox instability)."
  }
  if (s.onApproveHit && s.captureRejected && !s.captureResolved) {
    return "E) Capture lifecycle — onApprove ran but actions.order.capture() rejected (see PayPal / Smart API errors in browser-console.txt)."
  }
  if (!s.onApproveHit) {
    return "Approval UI did not reach app onApprove (blocked click, iframe, or buyer did not complete sandbox approval)."
  }
  return "Unclassified — inspect artifacts (screenshot, HTML, paypal-requests.txt, browser-console.txt)."
}

async function countPayPalSdkScripts(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = (globalThis as unknown as { document?: { querySelectorAll?: (selector: string) => unknown[] } }).document
    const scripts =
      typeof doc?.querySelectorAll === "function"
        ? Array.from(doc.querySelectorAll("script[src]") as Array<{ getAttribute?: (name: string) => string | null }>)
        : []
    return scripts.filter((el) => {
      const src = (el.getAttribute?.("src") ?? "").toLowerCase()
      return src.includes("paypal.com/sdk/js") || src.includes("sandbox.paypal.com/sdk/js")
    }).length
  })
}

async function countPayPalIframes(page: Page): Promise<number> {
  return page.locator('iframe[name^="__paypal"], iframe[name^="__zoid__"]').count()
}

async function clickPayPalSmartButtonHost(page: Page): Promise<void> {
  const iframe = page.locator('iframe[name^="__paypal"]').first()
  await iframe.waitFor({ state: "visible", timeout: 120_000 })
  const box = await iframe.boundingBox()
  expect(box, "PayPal iframe should have a bounding box").toBeTruthy()
  await page.mouse.click(box!.x + Math.min(120, box!.width / 2), box!.y + Math.min(48, box!.height / 2))
}

async function resolvePayPalWindow(page: Page): Promise<Page> {
  const popupWait = page.waitForEvent("popup", { timeout: 12_000 }).catch(() => null)
  await clickPayPalSmartButtonHost(page)
  const popup = await popupWait
  if (popup) {
    await popup.waitForLoadState("domcontentloaded").catch(() => {})
    return popup
  }
  await page.waitForURL(/paypal\.com|paypalinc\.com/i, { timeout: 90_000 })
  return page
}

async function approveSandboxIfNeeded(paypalPage: Page, email: string, password: string): Promise<void> {
  await paypalPage.waitForLoadState("domcontentloaded")

  const emailInput = paypalPage.locator('input[name="login_email"], input#email, input[type="email"]').first()
  if (await emailInput.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await emailInput.fill(email)
    await paypalPage.locator("#btnNext, button[name='btnNext'], button[type='submit']").first().click().catch(() => {})
  }

  const pwd = paypalPage.locator('input[name="login_password"], input#password, input[type="password"]').first()
  await pwd.waitFor({ state: "visible", timeout: 45_000 })
  await pwd.fill(password)
  await paypalPage.locator("#btnLogin, button[name='btnLogin'], button#btnLogin, button[type='submit']").first().click()

  const payButton = paypalPage.getByRole("button", { name: /Pay Now|Complete Purchase|Continue|Agree and Pay/i })
  await payButton.first().click({ timeout: 120_000 })
}

async function writeFailureBundle(
  page: Page,
  outDir: string,
  paypalRequestUrls: string[],
  browserLines: string[],
  classification: string,
  signalsJson: string,
): Promise<void> {
  await fs.mkdir(outDir, { recursive: true })
  const shot = path.join(outDir, "failure.png")
  const htmlPath = path.join(outDir, "failure.html")
  const netPath = path.join(outDir, "paypal-requests.txt")
  const logPath = path.join(outDir, "browser-console.txt")
  const classificationPath = path.join(outDir, "classification.txt")
  const signalsPath = path.join(outDir, "signals.json")

  await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
  const html = await page.content().catch(() => "<!-- could not read DOM -->")
  await fs.writeFile(htmlPath, html, "utf8")
  await fs.writeFile(netPath, paypalRequestUrls.join("\n"), "utf8")
  await fs.writeFile(logPath, browserLines.join("\n"), "utf8")
  await fs.writeFile(classificationPath, classification, "utf8")
  await fs.writeFile(signalsPath, signalsJson, "utf8")
  console.log(`[E2E] Failure bundle written under ${outDir}`)
}

test.describe.configure({ mode: "serial" })

test("PayPal Smart Buttons sandbox — diagnose buyer access token / capture lifecycle", async ({ page }, testInfo) => {
  test.skip(!BUYER_EMAIL || !BUYER_PASSWORD, "Set PAYPAL_SANDBOX_BUYER_EMAIL and PAYPAL_SANDBOX_BUYER_PASSWORD (or PAYPAL_SANDBOX_EMAIL / PAYPAL_SANDBOX_PASSWORD).")

  const browserLines: string[] = []
  const paypalRequestUrls: string[] = []
  const mainNavigationsDuringFlow: string[] = []
  let flowStarted = false
  let initialPath = ""

  page.on("console", (msg) => {
    const text = msg.text()
    browserLines.push(text)
    console.log("BROWSER:", text)
    if (text.includes("Buyer access token") || text.includes("buyer access token")) {
      console.error("PAYPAL TOKEN ERROR DETECTED:", text)
    }
  })

  page.on("request", (req) => {
    const url = req.url()
    if (url.includes("paypal")) {
      paypalRequestUrls.push(url)
      console.log("PAYPAL REQUEST:", url)
    }
  })

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && flowStarted) {
      try {
        const u = frame.url()
        if (u && !u.startsWith("about:")) mainNavigationsDuringFlow.push(u)
      } catch {
        /* ignore */
      }
    }
  })

  const signals: FailureSignals = {
    browserLines,
    paypalRequestUrls,
    paypalSdkScriptCountInitial: 0,
    paypalSdkScriptCountAfterOpen: 0,
    paypalIframeCount: 0,
    buyerAccessTokenError: false,
    onApproveHit: false,
    captureResolved: false,
    captureRejected: false,
    vipSuccessLog: false,
    unmountAfterOnApprove: false,
    mainNavigationsDuringFlow,
    duplicateSdkInjection: false,
  }

  const outDir = path.join(testInfo.outputDir, "paypal-failure-bundle")

  try {
    await page.goto("/checkout", { waitUntil: "domcontentloaded", timeout: 60_000 })
    initialPath = new URL(page.url()).pathname

    const missingClient = await page.getByText("VITE_PAYPAL_CLIENT_ID").isVisible().catch(() => false)
    test.skip(missingClient, "VITE_PAYPAL_CLIENT_ID is not set — cannot load Smart Buttons.")

    await page.waitForSelector('iframe[name^="__paypal"]', { timeout: 120_000 })
    console.log("PayPal iframe detected")

    signals.paypalSdkScriptCountInitial = await countPayPalSdkScripts(page)
    signals.paypalIframeCount = await countPayPalIframes(page)

    expect(signals.paypalSdkScriptCountInitial, "PayPal SDK script tag should load exactly once").toBe(1)
    expect(signals.paypalIframeCount, "/checkout uses one tier → expect one Smart Buttons iframe").toBe(1)

    flowStarted = true

    const paypalPage = await resolvePayPalWindow(page)
    await approveSandboxIfNeeded(paypalPage, BUYER_EMAIL, BUYER_PASSWORD)

    await page.waitForURL(
      (url) => {
        try {
          const p = new URL(url).pathname
          return p === initialPath || p === "/checkout"
        } catch {
          return false
        }
      },
      { timeout: 120_000 },
    )

    await page.waitForLoadState("networkidle").catch(() => {})

    signals.paypalSdkScriptCountAfterOpen = await countPayPalSdkScripts(page)
    signals.duplicateSdkInjection =
      signals.paypalSdkScriptCountAfterOpen > 1 || signals.paypalSdkScriptCountAfterOpen > signals.paypalSdkScriptCountInitial

    for (const line of browserLines) {
      if (/Buyer access token not present|buyer access token not present/i.test(line)) {
        signals.buyerAccessTokenError = true
      }
      if (line.includes("[E2E] ONAPPROVE_HIT")) signals.onApproveHit = true
      if (line.includes("[E2E] PAYPAL_CAPTURE_RESOLVED")) signals.captureResolved = true
      if (line.includes("[E2E] PAYPAL_CAPTURE_REJECTED")) signals.captureRejected = true
      if (line.includes("[E2E] VIP onSuccess")) signals.vipSuccessLog = true
    }

    const iApprove = indexAfter(browserLines, "[E2E] ONAPPROVE_HIT")
    const iUnmount = indexAfter(browserLines, "[E2E] PayPalButtons unmounted")
    if (iApprove !== -1 && iUnmount !== -1 && iUnmount > iApprove) {
      const iCap = indexAfter(browserLines, "[E2E] PAYPAL_CAPTURE_RESOLVED")
      if (iCap === -1 || iUnmount < iCap) {
        signals.unmountAfterOnApprove = true
      }
    }

    if (signals.buyerAccessTokenError || signals.captureRejected || !signals.captureResolved || !signals.onApproveHit) {
      const cls = classifyFailure(signals)
      await writeFailureBundle(
        page,
        outDir,
        paypalRequestUrls,
        browserLines,
        cls,
        JSON.stringify(
          {
            ...signals,
            browserLines: `${signals.browserLines.length} lines (see browser-console.txt)`,
          },
          null,
          2,
        ),
      )
    }

    expect(signals.buyerAccessTokenError, "Must not see PayPal buyer access token error in console").toBe(false)
    expect(signals.onApproveHit, "onApprove must run (look for [E2E] ONAPPROVE_HIT)").toBe(true)
    expect(signals.captureResolved, "capture() must resolve ([E2E] PAYPAL_CAPTURE_RESOLVED)").toBe(true)
    expect(signals.captureRejected, "capture() must not reject").toBe(false)
    expect(signals.vipSuccessLog, "Full client flow should complete ([E2E] VIP onSuccess)").toBe(true)

    const classification = signals.buyerAccessTokenError
      ? classifyFailure(signals)
      : "PASS — no buyer-access-token error; capture and post-capture flow completed."
    console.log("[E2E CLASSIFICATION]", classification)
  } catch (e) {
    signals.paypalSdkScriptCountAfterOpen = await countPayPalSdkScripts(page).catch(() => signals.paypalSdkScriptCountAfterOpen)
    signals.duplicateSdkInjection =
      signals.paypalSdkScriptCountAfterOpen > 1 || signals.paypalSdkScriptCountAfterOpen > signals.paypalSdkScriptCountInitial

    for (const line of browserLines) {
      if (/Buyer access token not present|buyer access token not present/i.test(line)) signals.buyerAccessTokenError = true
      if (line.includes("[E2E] ONAPPROVE_HIT")) signals.onApproveHit = true
      if (line.includes("[E2E] PAYPAL_CAPTURE_RESOLVED")) signals.captureResolved = true
      if (line.includes("[E2E] PAYPAL_CAPTURE_REJECTED")) signals.captureRejected = true
      if (line.includes("[E2E] VIP onSuccess")) signals.vipSuccessLog = true
    }

    const iApprove = indexAfter(browserLines, "[E2E] ONAPPROVE_HIT")
    const iUnmount = indexAfter(browserLines, "[E2E] PayPalButtons unmounted")
    if (iApprove !== -1 && iUnmount !== -1 && iUnmount > iApprove) {
      const iCap = indexAfter(browserLines, "[E2E] PAYPAL_CAPTURE_RESOLVED")
      if (iCap === -1 || iUnmount < iCap) signals.unmountAfterOnApprove = true
    }

    const classification = classifyFailure(signals)
    await writeFailureBundle(
      page,
      outDir,
      paypalRequestUrls,
      browserLines,
      classification,
      JSON.stringify(
        {
          ...signals,
          browserLines: `${signals.browserLines.length} lines (see browser-console.txt)`,
        },
        null,
        2,
      ),
    )
    console.error("[E2E CLASSIFICATION]", classification)
    throw e
  }
})
