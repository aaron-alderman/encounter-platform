import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const env = join(homedir(), "workspaces/aaron-active/dev/dev-20261108-a/env");
const { chromium } = createRequire(join(env, "browser-tools/package.json"))("playwright");
const scratch = await mkdtemp(join(homedir(), ".aster-panes-"));
const origin = process.env.ASTER_QA_ORIGIN;
const sharedPath = "/workspace/sourcery-os/shared.css";
const css = await readFile(process.env.ASTER_QA_SHARED_STYLE || "/var/www/appdev-projects/workspace/browser-assets/sourcery-os.css");

try {
  const browser = await chromium.launch({
    executablePath: join(env, "chrome-ready/chrome/linux-157.0.8103.38/chrome-linux64/chrome"),
    headless: true, args: ["--no-sandbox"], env: { ...process.env, TMPDIR: scratch },
  });
  try {
    for (const width of [1280, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 720 }, isMobile: width === 320, hasTouch: width === 320 });
      try {
        const page = await context.newPage();
        const errors = [];
        const images = new Map();
        page.on("pageerror", error => errors.push(error.message));
        page.on("response", response => { if (response.url().includes("/artifact?")) images.set(response.url(), response); });
        await page.route(origin + "/aster-codex/**", async route => {
          await route.continue({ headers: {
            ...route.request().headers(), "x-aster-codex-admission": process.env.ASTER_QA_TOKEN,
          } });
        });
        await page.route(origin + sharedPath, route => route.fulfill({ contentType: "text/css", body: css }));
        await page.goto(origin + "/aster-codex/");
        const list = page.locator("#chat-list");
        const transcript = page.locator("#conversation");
        const mobile = width === 320;
        await list.waitFor();
        if (mobile) {
          await transcript.waitFor({state:"hidden"});
        } else {
          await transcript.getByText("Select a chat to read its messages.").waitFor();
        }
        await list.locator('.chat-group > summary').filter({hasText:'> 2 weeks'}).click();
        await list.getByRole("link", { name: /Reader assurance/ }).click();
        await transcript.getByRole("heading", { name: "Reader assurance", exact: true }).waitFor();
        assert.equal(await list.locator("[aria-current=true] strong").textContent(), "Reader assurance");
        assert.equal(await transcript.locator("article header").first().locator("strong").innerText(), "Codex · Reply");
        assert.match(await transcript.locator("#conversation-title code").evaluate(el => getComputedStyle(el).fontFamily), /monospace/i);
        await page.waitForFunction(() => {
          const panel = document.querySelector("#chat-messages"), latest = document.querySelector("#latest");
          return panel.scrollTop > 0 && latest.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom + 1;
        }, {}, { timeout: 5000 });
        if (process.env.ASTER_QA_ROLLOUT) await page.screenshot({ path: join(process.env.ASTER_QA_ROLLOUT, "notes-" + width + ".jpg"), type: "jpeg", quality: 58 });
        const layout = await page.locator("#main").evaluate(el => {
          const list = el.querySelector("#chat-list");
          const transcript = el.querySelector("#conversation");
          const messages = transcript.querySelector("#chat-messages");
          const a = list.getBoundingClientRect(), b = transcript.getBoundingClientRect();
          return {
            columns: a.width > 0 && a.right <= b.left + 1, listHidden: a.width === 0,
            scrollable: [list, messages].every(pane => getComputedStyle(pane).overflowY === "auto"),
            separateScroll: (list.clientHeight === 0 || list.scrollHeight > list.clientHeight) && messages.scrollHeight > messages.clientHeight,
            pageFits: document.documentElement.scrollWidth <= innerWidth,
            themed: getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)",
          };
        });
        assert.deepEqual(layout, { columns: !mobile, listHidden: mobile, scrollable: true,
          separateScroll: true, pageFits: true, themed: true });
        const article = transcript.locator("article").filter({hasText:"Markdown fixture"});
        const table = article.getByRole("table");
        await table.getByRole("columnheader", {name:"Value"}).waitFor();
        assert.equal(await table.getAttribute("class"),"sourcery-data-table");
        assert.equal(await table.getByRole("cell",{name:"42"}).evaluate(el=>getComputedStyle(el).textAlign),"end");
        assert.ok(await table.getByRole("columnheader",{name:"Result"}).evaluate(el=>getComputedStyle(el.closest("thead")).backgroundColor!=="rgba(0, 0, 0, 0)"));
        assert.equal(await article.getByRole("link",{name:"Unsafe link"}).count(),0);
        const anchor = article.getByRole("link",{name:"Example link",exact:true});
        const address = article.locator(".aster-link-address").first();
        await anchor.scrollIntoViewIfNeeded();
        assert.equal(await address.isVisible(),false);
        const linkColor=await anchor.evaluate(el=>({
          color:getComputedStyle(el).color,
          text:getComputedStyle(el.parentElement).color,
          shadow:getComputedStyle(el.closest("article")).boxShadow,
          paper:getComputedStyle(el.closest("article")).backgroundColor,
          surrounding:getComputedStyle(el.closest("#conversation")).backgroundColor,
        }));
        assert.notEqual(linkColor.color,linkColor.text);
        if (mobile) {
          const showAddress = article.getByRole("button",{name:"Show link address",exact:true}).first();
          await showAddress.tap();
          const popover=article.locator(".aster-address-popover:popover-open");
          assert.equal(await popover.innerText(),"https://example.com/docs?one=two&three=four");
          const bounds=await popover.boundingBox();
          assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width+1);
          await page.keyboard.press("Escape");
          assert.equal(await popover.count(),0);
        } else {
          assert.equal(await article.getByRole("button",{name:"Show link address"}).count(),0);
          await anchor.hover();
          await address.waitFor({timeout:2000});
          console.log("Article edge",JSON.stringify({shadow:linkColor.shadow,paper:linkColor.paper,surrounding:linkColor.surrounding}));
        }
        assert.equal(await address.textContent(),"https://example.com/docs?one=two&three=four");
        if (process.env.ASTER_QA_ROLLOUT) await article.screenshot({path:join(process.env.ASTER_QA_ROLLOUT,"markdown-"+width+".png")});
        const image = transcript.getByRole("img", { name: "Open saved chat image" });
        const asset = new URL(await image.getAttribute("src"), origin).href;
        await image.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector("#conversation img")?.naturalWidth === 1, {}, { timeout: 8000 });
        assert.equal(images.get(asset)?.headers()["content-type"], "image/png");
        await transcript.getByText("Server-only preview", { exact: true }).click();
        assert.equal(await transcript.getByText("This address needs its original tunnel", { exact: false }).isVisible(), true);
        assert.equal(await page.evaluate(() => window.testInjection), undefined);
        await transcript.getByRole("link", { name: "Older messages" }).first().click();
        await transcript.getByText("fixture-message-060", { exact: true }).waitFor();
        if (mobile) {
          await transcript.getByRole("link", {name:"Chats",exact:true}).click();
          await list.waitFor();
          assert.equal(await list.evaluate(el => el.querySelector(location.hash)?.querySelector("strong")?.textContent), "Reader assurance");
        }
        const searchButton = list.getByRole("button", { name: "Search chat titles", exact: true });
        const searchPanel = list.locator("#chat-search-panel");
        assert.equal(await searchButton.locator("svg").count(), 1);
        const icon = await searchButton.boundingBox();
        const archive = await list.getByRole("link", {name:"Archived chats", exact:true}).boundingBox();
        assert.ok(icon.height <= 44, "Search fits on one toolbar row");

        if (process.env.ASTER_QA_ROLLOUT) {
          await list.locator(":scope > header").screenshot({path:join(process.env.ASTER_QA_ROLLOUT,"search-"+width+".png")});
        }
        assert.ok(Math.abs((icon.y+icon.height/2)-(archive.y+archive.height/2)) < 3, JSON.stringify({icon,archive}));
        await searchPanel.waitFor({ state: "hidden" });
        await searchButton.click();
        await searchPanel.waitFor();
        assert.equal(await list.getByRole("searchbox").evaluate(el => el === document.activeElement), true);
        const panel = await searchPanel.boundingBox();
        assert.ok(panel.x >= 0 && panel.x+panel.width <= width+1);
        if (process.env.ASTER_QA_ROLLOUT) {
          await searchPanel.screenshot({path:join(process.env.ASTER_QA_ROLLOUT,"search-open-"+width+".png")});
        }
        await page.keyboard.press("Escape");
        await searchPanel.waitFor({ state: "hidden" });
        assert.equal(await searchButton.evaluate(el => el === document.activeElement), true);
        await searchButton.click();
        await list.getByRole("searchbox").fill("Fixture search 29");
        await list.getByRole("button", { name: "Find", exact: true }).click();
        await list.getByRole("link", { name: /Fixture search 29/ }).waitFor();
        assert.equal(await list.getByRole("link", { name: /Fixture search 28/ }).count(), 0);
        if (!mobile) await transcript.getByText("fixture-message-060", { exact: true }).waitFor();
        await page.goto(origin + "/aster-codex/chat?id=" + process.env.ASTER_QA_CHAT);
        await page.waitForFunction(() => document.querySelector("#chat-messages").scrollTop > 0, {}, { timeout: 5000 });
        assert.deepEqual(errors, []);
        console.log(width + "px Chromium passed: shared manager panes, independent scrolling, selected chat, search, older messages, image and preview");
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
