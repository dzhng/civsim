// @vitest-environment node
import { expect, test, vi } from "vitest";
import { runSelected } from "./scene.mjs";

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("playwright", () => ({ chromium: { launch } }));

test("a throwing scene cannot leave pages or contexts live for the following scene", async () => {
  const contexts = new Set();
  function newContext() {
    const pages = new Set();
    const context = {
      async newPage() {
        const page = {
          on() {},
          async close() {
            pages.delete(page);
          },
        };
        pages.add(page);
        return page;
      },
      async close() {
        pages.clear();
        contexts.delete(context);
      },
      pages: () => [...pages],
    };
    contexts.add(context);
    return context;
  }
  const browser = {
    contexts: () => [...contexts],
    async newContext() {
      return newContext();
    },
    async newPage() {
      return newContext().newPage();
    },
    close: vi.fn(async () => {
      for (const context of [...contexts]) await context.close();
    }),
  };
  launch.mockResolvedValue(browser);
  let nextRan = false;
  let contextsAfterFailure = [];
  let contextsAfterSuccess = [];
  const code = await runSelected([
    {
      meta: { name: "throws" },
      file: "system/throws.mjs",
      async run(ctx) {
        await ctx.newPage();
        const context = await ctx.browser.newContext();
        await context.newPage();
        throw new Error("intentional scene failure");
      },
    },
    {
      meta: { name: "following" },
      file: "system/following.mjs",
      async run(ctx) {
        nextRan = true;
        contextsAfterFailure = browser.contexts();
        const page = await ctx.newPage();
        await page.close(); // Existing successful scenes already close their pages.
        ctx.check("following scene passed", true);
      },
    },
    {
      meta: { name: "last" },
      file: "system/last.mjs",
      async run() {
        contextsAfterSuccess = browser.contexts();
      },
    },
  ]);
  expect(nextRan).toBe(true);
  expect(contextsAfterFailure).toEqual([]);
  expect(contextsAfterSuccess).toEqual([]);
  expect(code).toBe(1); // Original scene failure remains reported.
  expect(browser.contexts()).toEqual([]);
  expect(browser.close).toHaveBeenCalledOnce();
  const success = await runSelected([
    {
      meta: { name: "self-closing" },
      file: "system/self-closing.mjs",
      async run(ctx) {
        const page = await ctx.newPage();
        await page.close();
      },
    },
  ]);
  expect(success).toBe(0);
  expect(browser.contexts()).toEqual([]);
  expect(browser.close).toHaveBeenCalledTimes(2);
});
