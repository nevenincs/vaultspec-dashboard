import type { Browser, Page } from "@playwright/test";
import { statistics } from "./graphFixtures.ts";

type BenchmarkWindow = Window & {
  graphBenchmark: typeof import("./graphHarness");
};

/** Interleave revisions at each sample, not only at each fixture, so temporal
 *  browser/OS drift is shared by both measurements. No two kernels run together. */
export async function runPairedKernels(
  browser: Browser,
  baseUrl: string,
  count: number,
): Promise<object[]> {
  const pages: Page[] = [];
  const runs: {
    label: "baseline" | "candidate";
    page: Page;
    errors: string[];
    environment: ReturnType<BenchmarkWindow["graphBenchmark"]["environment"]>;
  }[] = [];
  const rows: object[] = [];
  try {
    for (const label of ["baseline", "candidate"] as const) {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      pages.push(page);
      const errors: string[] = [];
      page.on("pageerror", (error) => {
        if (errors.length < 20) errors.push(error.message);
      });
      await page.goto(`${baseUrl.replace(/\/$/, "")}/${label}/`, {
        waitUntil: "load",
        timeout: 30000,
      });
      await page.waitForFunction(
        () => Boolean((window as BenchmarkWindow).graphBenchmark),
        undefined,
        { timeout: 10000 },
      );
      await waitForFonts(page);
      await page.waitForFunction(
        () => {
          const context = (window as BenchmarkWindow).graphBenchmark.environment();
          return !context.contextLost && Boolean(context.renderer);
        },
        undefined,
        { timeout: 10000 },
      );
      const environment = await page.evaluate(() =>
        (window as BenchmarkWindow).graphBenchmark.environment(),
      );
      if (errors.length) throw new Error(`${label}: ${errors.join("\n")}`);
      runs.push({ label, page, errors, environment });
    }

    const shapes =
      count === 20000 ? (["line"] as const) : (["cold", "dense", "line"] as const);
    for (const shape of shapes) {
      for (const { page } of runs) {
        await page.evaluate(
          ({ count, shape }) =>
            (window as BenchmarkWindow).graphBenchmark.initializeKernels(count, shape),
          { count, shape },
        );
      }
      const samples = runs.map(() => ({
        charge: [] as number[],
        collision: [] as number[],
      }));
      for (let round = 0; round < 25; round++) {
        for (let offset = 0; offset < runs.length; offset++) {
          const index = round % 2 ? runs.length - 1 - offset : offset;
          const sample = await runs[index].page.evaluate(() =>
            (window as BenchmarkWindow).graphBenchmark.sampleKernels(),
          );
          if (round >= 5) {
            samples[index].charge.push(sample.charge);
            samples[index].collision.push(sample.collision);
          }
        }
      }
      for (let index = 0; index < runs.length; index++) {
        const { label, page, errors, environment } = runs[index];
        if (errors.length) throw new Error(`${label}: ${errors.join("\n")}`);
        if (
          await page.evaluate(
            () => (window as BenchmarkWindow).graphBenchmark.environment().contextLost,
          )
        ) {
          throw new Error(`${label}: rendering context lost during paired kernels`);
        }
        rows.push({
          label,
          kind: "kernels",
          count,
          shape,
          environment,
          charge: statistics(samples[index].charge),
          collision: statistics(samples[index].collision),
        });
      }
    }
    return rows;
  } finally {
    await Promise.all(
      pages.map(async (page) => {
        try {
          await page
            .evaluate(() => {
              const benchmark = (window as BenchmarkWindow).graphBenchmark;
              benchmark?.clearKernels?.();
              benchmark?.destroy();
            })
            .catch(() => {});
        } finally {
          await page.close();
        }
      }),
    );
  }
}

export async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    let timer = 0;
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((_, reject) => {
          timer = window.setTimeout(
            () => reject(new Error("Benchmark fonts did not become ready")),
            10000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  });
}
