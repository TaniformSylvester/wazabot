/*
 * Playwright for the e2e suites, with one difference: after goto, reload,
 * goBack and waitForURL, wait until the dashboard's loading placeholder is gone. With the
 * styles inlined (next.config.ts, experimental.inlineCss) the page's "load"
 * event comes before the streamed content, so a check that reads the page
 * straight after navigating would see the placeholder; a person waits for the
 * content, and so do the tests.
 */
import { chromium as base } from "playwright";

/** The loading placeholder of app/[lang]/dashboard/loading.tsx (aria-busy with a label). */
async function settle(page) {
  try {
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"][aria-label]'), null, { timeout: 15000 });
  } catch {
    // A page that never loads fails on its own checks.
  }
}

function wrapPage(page) {
  for (const method of ["goto", "reload", "goBack", "waitForURL"]) {
    const original = page[method].bind(page);
    page[method] = async (...args) => {
      const response = await original(...args);
      await settle(page);
      return response;
    };
  }
  return page;
}

function wrapContext(context) {
  const newPage = context.newPage.bind(context);
  context.newPage = async () => wrapPage(await newPage());
  return context;
}

export const chromium = {
  launch: async (options) => {
    const browser = await base.launch(options);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (o) => wrapContext(await newContext(o));
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async (o) => wrapPage(await newPage(o));
    return browser;
  },
};
