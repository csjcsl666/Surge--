/*
 * Web Node Benchmark
 * Surge iOS
 */

const DEFAULTS = {
  group: "Proxy",
  url: "https://www.google.com/generate_204",
  request_timeout: 6,
  concurrency: 8,
  rounds: 3,
  top: 20
};

const EXCLUDE = new Set([
  "DIRECT",
  "REJECT",
  "REJECT-DROP",
  "REJECT-TINYGIF"
]);

function parseArgument(raw) {
  const result = {};

  if (!raw) return result;

  /*
   * URL is placed at the end of $argument.
   * This allows URLs containing their own query parameters:
   *
   * https://example.com/?a=1&b=2
   *
   * without destroying the URL.
   */

  const marker = "&url=";
  const urlIndex = raw.indexOf(marker);

  const prefix =
    urlIndex >= 0
      ? raw.slice(0, urlIndex)
      : raw;

  prefix.split("&").forEach(pair => {
    if (!pair) return;

    const i = pair.indexOf("=");

    if (i < 0) return;

    const key = pair.slice(0, i);
    const value = pair.slice(i + 1);

    result[key] = value;
  });

  if (urlIndex >= 0) {
    result.url =
      raw.slice(
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
  const number =
    parseInt(value, 10);

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
    .replace(
      /^https?:\/\//i,
      ""
    )
    .split("/")[0] || url;
}

function median(values) {
  const sorted =
    values
      .slice()
      .sort(
        (a, b) => a - b
      );

  const middle =
    Math.floor(
      sorted.length / 2
    );

  if (
    sorted.length % 2
  ) {
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
    title:
      "Web Node Benchmark",

    content:
      message,

    style:
      "error"
  });
}

/*
 * Read module arguments
 */

const args =
  parseArgument(
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
 * Validate target
 */

if (
  !/^https?:\/\//i.test(
    TARGET
  )
) {

  doneError(
    `Invalid target URL:\n${TARGET}`
  );

} else {

  const details =
    $surge.selectGroupDetails();

  if (
    !details ||
    !details.groups ||
    !details.groups[GROUP]
  ) {

    const groups =
      details &&
      details.groups
        ? Object.keys(
            details.groups
          )
        : [];

    doneError(
      `Select group not found: ${GROUP}` +
      (
        groups.length
          ? `\n\nAvailable select groups:\n${groups.join("\n")}`
          : ""
      )
    );

  } else {

    const policies =
      flattenSelectGroup(
        GROUP,
        details.groups
      );

    if (
      !policies.length
    ) {

      doneError(
        `No testable policies found in: ${GROUP}`
      );

    } else {

      runBenchmark(
        policies
      );

    }
  }
}

/*
 * Recursively expand nested
 * Surge select groups.
 */

function flattenSelectGroup(
  root,
  groups
) {

  const output = [];

  const added =
    new Set();

  const visiting =
    new Set();

  function walk(
    groupName
  ) {

    /*
     * Protect against
     * accidental group loops.
     */

    if (
      visiting.has(
        groupName
      )
    ) {
      return;
    }

    visiting.add(
      groupName
    );

    const children =
      groups[groupName] ||
      [];

    children.forEach(
      name => {

        if (
          !name ||
          EXCLUDE.has(name)
        ) {
          return;
        }

        /*
         * Nested select group
         */

        if (
          groups[name]
        ) {

          walk(name);

        } else if (
          !added.has(name)
        ) {

          added.add(name);

          output.push(name);

        }
      }
    );

    visiting.delete(
      groupName
    );
  }

  walk(root);

  return output;
}

/*
 * Benchmark queue
 */

function runBenchmark(
  policies
) {

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

          results.push(
            result
          );

          active--;

          finished++;

          if (
            finished ===
            policies.length
          ) {

            render(
              results
            );

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
 * Test one policy
 * multiple times.
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

    if (
      round >= ROUNDS
    ) {

      /*
       * All rounds failed.
       */

      if (
        !samples.length
      ) {

        callback({
          policy:
            policy,

          ok:
            false,

          failures:
            ROUNDS
        });

        return;
      }

      /*
       * Use median latency
       * for ranking.
       */

      callback({
        policy:
          policy,

        ok:
          true,

        median:
          median(samples),

        min:
          Math.min(
            ...samples
          ),

        max:
          Math.max(
            ...samples
          ),

        successes:
          samples.length,

        failures:
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

        if (
          result.ok
        ) {

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
 * Single HTTP GET benchmark
 */

function testOnce(
  policy,
  callback
) {

  const started =
    Date.now();

  $httpClient.get(
    {

      url:
        TARGET,

      /*
       * Critical:
       * force request through
       * this Surge policy.
       */

      policy:
        policy,

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

      "auto-redirect":
        true,

      "auto-cookie":
        false
    },

    (
      error,
      response
    ) => {

      const elapsed =
        Date.now() -
        started;

      if (
        error
      ) {

        callback({
          ok:
            false,

          time:
            elapsed,

          error:
            String(error)
        });

        return;
      }

      callback({

        ok:
          true,

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
 * Render Surge Panel
 */

function render(
  results
) {

  const success =
    results
      .filter(
        item => item.ok
      )
      .sort(
        (a, b) =>
          a.median -
          b.median
      );

  const failed =
    results
      .filter(
        item => !item.ok
      )
      .sort(
        (a, b) =>
          a.policy.localeCompare(
            b.policy
          )
      );

  const lines = [];

  success
    .slice(
      0,
      TOP
    )
    .forEach(
      (
        item,
        index
      ) => {

        const reliability =
          `${item.successes}/${ROUNDS}`;

        const warning =
          item.failures
            ? " ⚠︎"
            : "";

        lines.push(
          `${index + 1}. ${item.policy}\n` +
          `   ${item.median} ms · HTTP ${item.status} · ${reliability}${warning}`
        );

      }
    );

  if (
    success.length >
    TOP
  ) {

    lines.push(
      `\n… ${
        success.length -
        TOP
      } more successful policies`
    );

  }

  if (
    failed.length
  ) {

    lines.push(
      `\nFailed: ${failed.length}`
    );

    failed
      .slice(
        0,
        10
      )
      .forEach(
        item => {

          lines.push(
            `• ${item.policy} — timeout/error`
          );

        }
      );

    if (
      failed.length >
      10
    ) {

      lines.push(
        `… ${
          failed.length -
          10
        } more failed policies`
      );

    }
  }

  $done({

    title:
      "Web Node Benchmark",

    content:
      `Target: ${hostOf(TARGET)}\n` +
      `Group: ${GROUP}\n` +
      `Nodes: ${results.length} · Rounds: ${ROUNDS}\n\n` +
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
