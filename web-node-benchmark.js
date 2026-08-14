/*
 * Web Node Benchmark
 * Surge iOS
 *
 * Only benchmarks first-level policies in the selected group.
 * Nested policy groups will NOT be expanded.
 */

const DEFAULTS = {
  group: "Proxy",
  url: "https://www.google.com/generate_204",
  request_timeout: 6,
  concurrency: 8,
  rounds: 1,
  top: 20
};

// Reject policies are meaningless for web benchmark.
// DIRECT is intentionally NOT excluded.
const EXCLUDE = new Set([
  "REJECT",
  "REJECT-DROP",
  "REJECT-TINYGIF"
]);

/*
 * Parse module arguments.
 *
 * Keep url as the final argument so URLs containing
 * query parameters such as ?a=1&b=2 still work.
 */
function parseArgument(raw) {
  const result = {};

  if (!raw) return result;

  const marker = "&url=";
  const urlIndex = raw.indexOf(marker);

  const prefix =
    urlIndex >= 0
      ? raw.slice(0, urlIndex)
      : raw;

  prefix.split("&").forEach(pair => {
    if (!pair) return;

    const index = pair.indexOf("=");

    if (index < 0) return;

    const key = pair.slice(0, index);
    const value = pair.slice(index + 1);

    result[key] = value;
  });

  if (urlIndex >= 0) {
    result.url = raw.slice(
      urlIndex + marker.length
    );
  }

  return result;
}

function intValue(
  value,
  fallback,
  min,
  max
) {
  const number = parseInt(value, 10);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(
    min,
    Math.min(max, number)
  );
}

function hostOf(url) {
  return String(url)
    .replace(/^https?:\/\//i, "")
    .split("/")[0] || url;
}

function median(values) {
  const sorted = values
    .slice()
    .sort((a, b) => a - b);

  const middle =
    Math.floor(sorted.length / 2);

  if (sorted.length % 2) {
    return sorted[middle];
  }

  return Math.round(
    (
      sorted[middle - 1] +
      sorted[middle]
    ) / 2
  );
}

function doneError(message) {
  $done({
    title: "Web Node Benchmark",
    content: message,
    style: "error"
  });
}

/*
 * Read arguments
 */

const args = parseArgument(
  typeof $argument === "string"
    ? $argument
    : ""
);

const GROUP =
  args.group ||
  DEFAULTS.group;

const TARGET =
  args.url ||
  DEFAULTS.url;

const REQUEST_TIMEOUT =
  intValue(
    args.request_timeout,
    DEFAULTS.request_timeout,
    1,
    30
  );

const CONCURRENCY =
  intValue(
    args.concurrency,
    DEFAULTS.concurrency,
    1,
    20
  );

const ROUNDS =
  intValue(
    args.rounds,
    DEFAULTS.rounds,
    1,
    5
  );

const TOP =
  intValue(
    args.top,
    DEFAULTS.top,
    1,
    50
  );

/*
 * Validate URL
 */

if (!/^https?:\/\//i.test(TARGET)) {
  doneError(
    `Invalid target URL:\n${TARGET}`
  );
} else {
  start();
}

/*
 * Get ONLY first-level policies.
 */

function start() {
  const details =
    $surge.selectGroupDetails();

  if (
    !details ||
    !details.groups ||
    !details.groups[GROUP]
  ) {
    const availableGroups =
      details && details.groups
        ? Object.keys(details.groups)
        : [];

    doneError(
      `Policy group not found:\n${GROUP}` +
      (
        availableGroups.length
          ? `\n\nAvailable groups:\n${availableGroups.join("\n")}`
          : ""
      )
    );

    return;
  }

  /*
   * IMPORTANT:
   *
   * Do NOT recursively expand groups.
   *
   * Example:
   *
   * 节点选择
   * ├─ 香港节点
   * ├─ 日本节点
   * ├─ 美国节点
   * └─ 落地机
   *
   * We benchmark ONLY these four policies.
   *
   * If 香港节点 itself is SMART/select/url-test,
   * Surge decides which underlying node it uses.
   */

  const policies =
    details.groups[GROUP]
      .filter(policy => {
        return (
          policy &&
          !EXCLUDE.has(policy)
        );
      });

  if (!policies.length) {
    doneError(
      `No testable policies found in:\n${GROUP}`
    );

    return;
  }

  runBenchmark(policies);
}

/*
 * Benchmark queue
 */

function runBenchmark(policies) {
  let cursor = 0;
  let active = 0;
  let finished = 0;

  const results = [];

  function pump() {
    while (
      active < CONCURRENCY &&
      cursor < policies.length
    ) {
      const policy =
        policies[cursor++];

      active++;

      testPolicy(
        policy,
        result => {
          results.push(result);

          active--;
          finished++;

          if (
            finished ===
            policies.length
          ) {
            render(results);
          } else {
            pump();
          }
        }
      );
    }
  }

  pump();
}

/*
 * Test one first-level policy.
 */

function testPolicy(
  policy,
  callback
) {
  const samples = [];
  const statuses = [];

  let failures = 0;
  let round = 0;

  function nextRound() {
    if (round >= ROUNDS) {
      if (!samples.length) {
        callback({
          policy,
          ok: false,
          failures
        });

        return;
      }

      callback({
        policy,
        ok: true,

        median:
          median(samples),

        min:
          Math.min(...samples),

        max:
          Math.max(...samples),

        successes:
          samples.length,

        failures,

        status:
          statuses[
            statuses.length - 1
          ] || 0
      });

      return;
    }

    round++;

    testOnce(
      policy,
      result => {
        if (result.ok) {
          samples.push(
            result.time
          );

          statuses.push(
            result.status
          );
        } else {
          failures++;
        }

        nextRound();
      }
    );
  }

  nextRound();
}

/*
 * One HTTP GET request.
 */

function testOnce(
  policy,
  callback
) {
  const started =
    Date.now();

  $httpClient.get(
    {
      url: TARGET,

      /*
       * Force this request through
       * the selected first-level policy.
       *
       * If the policy itself is SMART,
       * Surge SMART decides the actual node.
       */
      policy: policy,

      timeout:
        REQUEST_TIMEOUT,

      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

        "Cache-Control":
          "no-cache",

        "Pragma":
          "no-cache"
      },

      "auto-redirect": true,
      "auto-cookie": false
    },

    (
      error,
      response
    ) => {
      const elapsed =
        Date.now() - started;

      if (error) {
        callback({
          ok: false,
          time: elapsed,
          error: String(error)
        });

        return;
      }

      callback({
        ok: true,

        time:
          elapsed,

        status:
          response &&
          typeof response.status !==
            "undefined"
            ? response.status
            : 0
      });
    }
  );
}

/*
 * Render panel
 */

function render(results) {
  const success =
    results
      .filter(item => item.ok)
      .sort(
        (a, b) =>
          a.median -
          b.median
      );

  const failed =
    results
      .filter(item => !item.ok)
      .sort(
        (a, b) =>
          a.policy.localeCompare(
            b.policy
          )
      );

  const lines = [];

  success
    .slice(0, TOP)
    .forEach(
      (item, index) => {
        let detail =
          `${item.median} ms · HTTP ${item.status}`;

        /*
         * Only display round info
         * when more than one round is used.
         */
        if (ROUNDS > 1) {
          detail +=
            ` · ${item.successes}/${ROUNDS}`;

          if (item.failures) {
            detail += " ⚠︎";
          }
        }

        lines.push(
          `${index + 1}. ${item.policy}\n   ${detail}`
        );
      }
    );

  if (success.length > TOP) {
    lines.push(
      `\n… ${
        success.length - TOP
      } more policies`
    );
  }

  if (failed.length) {
    lines.push(
      `\nFailed: ${failed.length}`
    );

    failed.forEach(
      item => {
        lines.push(
          `• ${item.policy} — timeout/error`
        );
      }
    );
  }

  $done({
    title:
      "Web Node Benchmark",

    content:
      `Target: ${hostOf(TARGET)}\n` +
      `Group: ${GROUP}\n` +
      `Policies: ${results.length}` +
      (
        ROUNDS > 1
          ? ` · Rounds: ${ROUNDS}`
          : ""
      ) +
      `\n\n` +
      (
        lines.join("\n") ||
        "No result."
      ),

    style:
      success.length
        ? "good"
        : "error"
  });
}
