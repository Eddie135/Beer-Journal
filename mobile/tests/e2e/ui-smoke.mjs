import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const viewports = [
  { width: 360, height: 800 },
  { width: 393, height: 852 },
  { width: 412, height: 915 },
];
const baseURL = process.env.BETA4_BASE_URL || "http://127.0.0.1:4173";
const artifacts = fileURLToPath(new URL("./.artifacts/", import.meta.url));
const capture = async (target, options) => {
  if (!process.env.BETA4_NO_SCREENSHOTS) await target.screenshot(options);
};

function moduleSpecifier() {
  if (process.env.PLAYWRIGHT_MODULE_PATH) return pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href;
  return "playwright";
}

let playwright;
try {
  const imported = await import(moduleSpecifier());
  playwright = imported.chromium ? imported : (imported.default || imported);
} catch (error) {
  console.error("Playwright 未安装或不可解析。请安装 mobile 的 devDependency @playwright/test，或设置 PLAYWRIGHT_MODULE_PATH。", error.message);
  process.exitCode = 2;
}

if (playwright) {
  const serverCommand = process.platform === "win32" ? process.env.ComSpec : "pnpm";
  const previewCommand = process.env.BETA4_SKIP_BUILD ? "pnpm run preview:test" : "pnpm run build:test && pnpm run preview:test";
  const serverArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", previewCommand]
    : ["-c", previewCommand];
  const server = spawn(serverCommand, serverArgs, {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    env: { ...process.env, VITE_APP_TEST_MODE: "true" },
    stdio: "ignore",
  });
  const waitForServer = async () => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      try { const response = await fetch(baseURL); if (response.ok) return; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Vite preview 未能在测试端口启动");
  };
  try {
    await waitForServer();
    await mkdir(artifacts, { recursive: true });
    const launchOptions = { headless: true };
    if (process.env.BETA4_BROWSER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.BETA4_BROWSER_EXECUTABLE_PATH;
    }
    const browser = await playwright.chromium.launch(launchOptions);
    try {
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        page.on("console", (message) => console.debug(`[browser:${message.type()}] ${message.text()}`));
        page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
        await page.goto(`${baseURL}/#/beers`, { waitUntil: "networkidle" });
        try {
          await page.locator(".collection-card").first().waitFor();
        } catch (error) {
          console.error("Beer list did not render:", await page.locator("body").innerText());
          throw error;
        }
        assert.ok(await page.locator(".collection-card").count() >= 1, `Beer cards render at ${viewport.width}px`);
        await capture(page, { path: `${artifacts}/beers-${viewport.width}.png`, fullPage: true });

        await page.locator("[data-filter-open]").click();
        const sheet = page.locator("[data-filter-sheet]");
        const backdrop = page.locator("[data-filter-overlay]");
        assert.equal(await sheet.isVisible(), true, `Filter Sheet visible at ${viewport.width}px`);
        assert.equal(await backdrop.isVisible(), true, `Filter backdrop visible at ${viewport.width}px`);
        const sheetBox = await sheet.boundingBox();
        assert.ok(sheetBox?.height > 0 && sheetBox?.width > 0, "Filter Sheet has a visible box");
        const styles = await sheet.evaluate((node) => { const style = getComputedStyle(node); return { opacity: style.opacity, pointerEvents: style.pointerEvents, transform: style.transform }; });
        assert.equal(styles.opacity, "1");
        assert.notEqual(styles.pointerEvents, "none");
        assert.notEqual(await sheet.evaluate((node) => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)", "Filter Sheet background is opaque");
        for (const label of ["国家", "风味标签", "最低评分", "最高评分"]) {
          assert.ok((await sheet.innerText()).includes(label), `Filter Sheet contains ${label}`);
        }
        const footer = sheet.locator(".filter-actions");
        assert.equal(await footer.isVisible(), true, "Filter footer remains visible");
        const scrollState = await sheet.locator(".collection-filters").evaluate((node) => ({ overflowY: getComputedStyle(node).overflowY, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }));
        assert.ok(["auto", "scroll"].includes(scrollState.overflowY), "Filter body can scroll");
        const navBox = await page.locator("[data-app-bottom-nav]").boundingBox();
        if (navBox) {
          const topElement = await page.evaluate(({ x, y }) => document.elementsFromPoint(x, y)[0]?.closest("[data-app-bottom-nav]") ? "bottom-nav" : "overlay", { x: navBox.x + navBox.width / 2, y: navBox.y + navBox.height / 2 });
          assert.equal(topElement, "overlay", "Filter overlay blocks bottom navigation");
        }
        // Fixed overlays are reviewed at the actual viewport; fullPage capture
        // can expose pixels below the viewport behind a fixed backdrop.
        await capture(page, { path: `${artifacts}/filter-${viewport.width}.png`, fullPage: false });
        await page.locator("[data-filter-category]").nth(1).click();
        await page.locator("[data-filter-apply]").click();
        assert.equal(await sheet.isVisible(), false, "Filter Sheet closes after apply");
        assert.ok((await page.locator(".collection-card").count()) >= 1, "Filtered list remains visible");

        await page.locator("[data-filter-open]").click();
        await page.locator("[data-filter-sheet]").waitFor();
        await page.waitForTimeout(50);
        await page.locator("[data-filter-country]").click();
        const countryPicker = page.locator(".local-country-picker .local-country-sheet");
        if (!(await countryPicker.isVisible())) console.error("Country picker did not open:", await page.locator("body").innerText());
        assert.equal(await countryPicker.isVisible(), true, "Country picker opens from Filter Sheet");
        await countryPicker.locator("[data-country-search]").fill("比利时");
        await countryPicker.locator("[data-country-code]").first().click();
        await page.locator("[data-filter-open]").click();
        const tagChoices = page.locator("[data-filter-tag]");
        if (await tagChoices.count() > 1) await tagChoices.nth(1).click();
        await page.locator("[data-filter-apply]").click();
        assert.ok((await page.locator(".local-filter-summary").innerText()).length > 0, "Country/tag filter summary is visible");

        await page.locator("[data-filter-open]").click();
        await page.locator("[data-filter-reset]").click();
        assert.ok((await page.locator(".collection-card").count()) >= 1, "Reset restores the collection");
        await page.locator(".collection-card").last().scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(50);
        const lastCardBox = await page.locator(".collection-card").last().boundingBox();
        const finalNavBox = await page.locator("[data-app-bottom-nav]").boundingBox();
        if (lastCardBox && finalNavBox) assert.ok(lastCardBox.y + lastCardBox.height <= finalNavBox.y, `Last Beer card clears bottom navigation after scrolling: ${JSON.stringify({ lastCardBox, finalNavBox })}`);

        const firstBeerHref = await page.locator(".collection-card-link").first().getAttribute("href");
        const screenshotRoute = async (name, path) => {
          await page.goto(`${baseURL}/#${path}`, { waitUntil: "networkidle" });
          await page.waitForTimeout(350);
          await capture(page, { path: `${artifacts}/${name}-${viewport.width}.png`, fullPage: true });
        };
        await screenshotRoute("beer-new", "/beers/new");
        await page.locator("[data-country-picker]").click();
        await capture(page.locator(".local-country-picker .local-country-sheet"), { path: `${artifacts}/country-picker-${viewport.width}.png` });
        await page.locator(".local-country-sheet [data-country-close]").click();
        await page.locator('[data-choice-picker="category"]').click();
        await capture(page.locator(".local-choice-picker"), { path: `${artifacts}/category-picker-${viewport.width}.png` });
        await page.locator("[data-choice-close]").first().click();
        await page.locator('[data-choice-picker="style"]').click();
        await capture(page.locator(".local-choice-picker"), { path: `${artifacts}/style-picker-${viewport.width}.png` });
        await page.locator("[data-choice-close]").first().click();
        await screenshotRoute("beer-profile", "/profile");
        await screenshotRoute("tastings", "/tastings");
        if (firstBeerHref) {
          await screenshotRoute("beer-detail", firstBeerHref.slice(1));
          await screenshotRoute("beer-edit", `${firstBeerHref}/edit`.replace("#", ""));
        }
        await screenshotRoute("tasting-select-beer", "/tastings/new");
        await page.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }
}
