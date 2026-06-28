/* eslint-disable no-console */

const BASE_URL = process.env.REPORT_BASE_URL || "http://localhost:3000";
const TOKEN = process.env.REPORT_BEARER_TOKEN || "";
const DATE = process.env.REPORT_DATE || new Date().toISOString().slice(0, 10);
const MONTH = process.env.REPORT_MONTH || DATE.slice(0, 7);
const COMPANY_ID = process.env.REPORT_COMPANY_ID || "";
const CYCLES = Math.max(1, Number(process.env.REPORT_CYCLES || 30));
const CONCURRENCY = Math.max(1, Number(process.env.REPORT_CONCURRENCY || 10));

function headers() {
  return {
    Accept: "application/json",
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  };
}

function toUrl(path, params) {
  const url = new URL(path, BASE_URL);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function timedGet(url) {
  const start = performance.now();
  const res = await fetch(url, { headers: headers() });
  const elapsedMs = performance.now() - start;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 240)}`);
  }
  await res.arrayBuffer();
  return elapsedMs;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

async function runCase(name, urlBuilder) {
  const latencies = [];
  let errors = 0;

  const workers = Array.from({ length: CONCURRENCY }).map(async () => {
    for (let i = 0; i < CYCLES; i += 1) {
      try {
        const url = urlBuilder(i);
        const ms = await timedGet(url);
        latencies.push(ms);
      } catch (error) {
        errors += 1;
        console.error(`[${name}]`, String(error));
      }
    }
  });

  await Promise.all(workers);

  const count = latencies.length;
  const avg = count ? latencies.reduce((sum, n) => sum + n, 0) / count : 0;

  console.log(`\n=== ${name} ===`);
  console.log(`requests=${count}, errors=${errors}`);
  console.log(`avg=${avg.toFixed(2)}ms p50=${percentile(latencies, 50).toFixed(2)}ms p95=${percentile(latencies, 95).toFixed(2)}ms p99=${percentile(latencies, 99).toFixed(2)}ms`);
}

async function main() {
  console.log("Report load test start");
  console.log(`base=${BASE_URL} date=${DATE} month=${MONTH} concurrency=${CONCURRENCY} cycles=${CYCLES}`);

  await runCase("daily summary", () =>
    toUrl("/reports/daily", {
      date: DATE,
      companyId: COMPANY_ID || undefined,
    }),
  );

  await runCase("monthly summary", () =>
    toUrl("/reports/monthly", {
      month: MONTH,
      companyId: COMPANY_ID || undefined,
    }),
  );

  await runCase("daily detail summaryOnly", () =>
    toUrl("/reports/daily/detail", {
      date: DATE,
      summaryOnly: true,
      companyId: COMPANY_ID || undefined,
    }),
  );

  await runCase("daily detail ABSENT page", () =>
    toUrl("/reports/daily/detail", {
      date: DATE,
      status: "ABSENT",
      page: 1,
      pageSize: 50,
      companyId: COMPANY_ID || undefined,
    }),
  );

  console.log("\nReport load test done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
