/*
 * Web Node Benchmark
 * For Surge iOS
 *
 * 同一目标 URL，同时测试：
 *
 * 1. GET
 *    完整 HTTP GET 请求完成时间
 *
 * 2. 延迟
 *    HTTP HEAD 延迟
 *
 * 延迟测试：
 * HEAD #1 = 预热
 * HEAD #2 = 正式计时
 *
 * 尽量贴近 Surge 自带延迟测试逻辑。
 *
 * 注意：
 * “延迟”不是 ICMP Ping。
 */


/* =========================================================
 * 默认参数
 * ========================================================= */

const DEFAULTS = {
  group: "Proxy",

  url:
    "https://www.google.com/generate_204",

  request_timeout: 6,

  concurrency: 8,

  rounds: 1,

  top: 20
};


/*
 * 不测试的特殊策略
 *
 * DIRECT 保留，
 * 因为可能需要比较直连和代理。
 */

const EXCLUDE = new Set([
  "REJECT",
  "REJECT-DROP",
  "REJECT-TINYGIF"
]);


/* =========================================================
 * 参数解析
 * ========================================================= */

function parseArgument(raw) {

  const result = {};

  if (!raw) {
    return result;
  }


  /*
   * url 参数必须放在 argument 最后。
   *
   * 防止 URL 自己包含：
   *
   * ?a=1&b=2
   *
   * 时被错误拆分。
   */

  const marker =
    "&url=";

  const urlIndex =
    raw.indexOf(marker);


  const prefix =
    urlIndex >= 0
      ? raw.slice(
          0,
          urlIndex
        )
      : raw;


  prefix
    .split("&")
    .forEach(
      pair => {

        if (!pair) {
          return;
        }


        const index =
          pair.indexOf("=");


        if (index < 0) {
          return;
        }


        const key =
          pair.slice(
            0,
            index
          );


        const value =
          pair.slice(
            index + 1
          );


        try {

          result[
            decodeURIComponent(key)
          ] =
            decodeURIComponent(
              value.replace(
                /\+/g,
                " "
              )
            );

        } catch (_) {

          result[key] =
            value;

        }

      }
    );


  /*
   * 单独处理最后的 URL
   */

  if (
    urlIndex >= 0
  ) {

    const rawUrl =
      raw.slice(
        urlIndex +
        marker.length
      );


    try {

      result.url =
        decodeURIComponent(
          rawUrl
        );

    } catch (_) {

      result.url =
        rawUrl;

    }

  }


  return result;
}


/* =========================================================
 * 工具函数
 * ========================================================= */

function intValue(
  value,
  fallback,
  min,
  max
) {

  const number =
    parseInt(
      value,
      10
    );


  if (
    !Number.isFinite(
      number
    )
  ) {

    return fallback;

  }


  return Math.max(
    min,
    Math.min(
      max,
      number
    )
  );
}


/*
 * 提取域名
 */

function hostOf(url) {

  return String(url)

    .replace(
      /^https?:\/\//i,
      ""
    )

    .split("/")[0]

    || url;
}


/*
 * 计算中位数
 */

function median(values) {

  const sorted =
    values
      .slice()
      .sort(
        (a, b) =>
          a - b
      );


  const middle =
    Math.floor(
      sorted.length / 2
    );


  if (
    sorted.length % 2
  ) {

    return sorted[
      middle
    ];

  }


  return Math.round(
    (
      sorted[
        middle - 1
      ] +

      sorted[
        middle
      ]
    ) / 2
  );
}


/* =========================================================
 * GET 速度评级
 * ========================================================= */

/*
 * GET 不是单纯延迟。
 *
 * 包含：
 *
 * 代理链路
 * HTTPS / TLS
 * 网站响应
 * 主文档下载
 * HTTP GET 完成
 *
 *
 * 评级同时考虑：
 *
 * 1. 绝对 GET 时间
 * 2. 相对本轮最快策略
 *
 *
 * 快：
 * <= 500 ms
 * 且
 * <= 最快策略 1.30 倍
 *
 * 正常：
 * <= 1000 ms
 * 且
 * <= 最快策略 1.80 倍
 *
 * 其他：
 * 慢
 */

function getSpeedLevel(
  ms,
  fastest
) {

  if (
    !fastest ||
    fastest <= 0
  ) {

    if (
      ms <= 500
    ) {
      return "快";
    }


    if (
      ms <= 1000
    ) {
      return "正常";
    }


    return "慢";
  }


  const ratio =
    ms / fastest;


  if (
    ms <= 500 &&
    ratio <= 1.30
  ) {

    return "快";

  }


  if (
    ms <= 1000 &&
    ratio <= 1.80
  ) {

    return "正常";

  }


  return "慢";
}


/* =========================================================
 * 延迟评级
 * ========================================================= */

/*
 * 这里指 HTTP HEAD 延迟。
 *
 * 不是 GET。
 * 不是 ICMP Ping。
 */

function latencyLevel(ms) {

  if (
    ms <= 80
  ) {
    return "低";
  }


  if (
    ms <= 150
  ) {
    return "正常";
  }


  if (
    ms <= 250
  ) {
    return "较高";
  }


  return "高";
}


/* =========================================================
 * GET HTTP 状态中文化
 * ========================================================= */

function httpStatusText(status) {

  switch (status) {

    case 200:
      return "访问成功";


    case 201:

    case 202:

    case 204:
      return "请求成功";


    case 301:

    case 302:

    case 303:

    case 307:

    case 308:
      return "已重定向";


    case 400:
      return "请求异常";


    case 401:
      return "需要登录";


    case 403:
      return "访问受限";


    case 404:
      return "页面不存在";


    case 405:
      return "请求方式不支持";


    case 408:
      return "请求超时";


    case 409:
      return "请求冲突";


    case 410:
      return "页面已删除";


    case 418:
      return "请求被拒绝";


    case 429:
      return "请求过于频繁";


    case 500:
      return "服务器错误";


    case 501:
      return "服务器不支持";


    case 502:
      return "网关错误";


    case 503:
      return "服务暂不可用";


    case 504:
      return "网关超时";


    case 520:

    case 521:

    case 522:

    case 523:

    case 524:
      return "服务器连接异常";
  }


  if (
    status >= 200 &&
    status < 300
  ) {

    return "请求成功";

  }


  if (
    status >= 300 &&
    status < 400
  ) {

    return "已重定向";

  }


  if (
    status >= 400 &&
    status < 500
  ) {

    return "访问异常";

  }


  if (
    status >= 500 &&
    status < 600
  ) {

    return "服务器异常";

  }


  if (!status) {

    return "状态未知";

  }


  return `状态 ${status}`;
}


/* =========================================================
 * HEAD 状态提示
 * ========================================================= */

/*
 * 延迟测试主要关心：
 *
 * “多久收到服务器响应”
 *
 * 所以即使 HEAD 返回 403 / 405，
 * 仍然可能测到响应时间。
 *
 * 但会额外提示。
 */

function headStatusText(status) {

  if (!status) {
    return "";
  }


  if (
    status >= 200 &&
    status < 400
  ) {

    return "";

  }


  if (
    status === 401 ||
    status === 403
  ) {

    return " · HEAD 受限";

  }


  if (
    status === 405
  ) {

    return " · 不支持 HEAD";

  }


  if (
    status === 429
  ) {

    return " · 请求频繁";

  }


  if (
    status >= 500
  ) {

    return " · 服务器异常";

  }


  return " · HEAD 异常";
}


/* =========================================================
 * 错误中文化
 * ========================================================= */

function errorText(error) {

  if (!error) {
    return "连接失败";
  }


  const text =
    String(error)
      .toLowerCase();


  if (
    text.includes(
      "timeout"
    ) ||

    text.includes(
      "timed out"
    )
  ) {

    return "请求超时";

  }


  if (
    text.includes(
      "dns"
    )
  ) {

    return "DNS 解析失败";

  }


  if (
    text.includes(
      "certificate"
    ) ||

    text.includes(
      "ssl"
    ) ||

    text.includes(
      "tls"
    )
  ) {

    return "HTTPS 连接失败";

  }


  if (
    text.includes(
      "connection refused"
    )
  ) {

    return "连接被拒绝";

  }


  if (
    text.includes(
      "network"
    )
  ) {

    return "网络连接失败";

  }


  return "连接失败";
}


/* =========================================================
 * Panel 错误
 * ========================================================= */

function doneError(
  message
) {

  $done({

    title:
      "Web Node Benchmark",

    content:
      message,

    style:
      "error"

  });

}


/* =========================================================
 * 获取参数
 * ========================================================= */

const args =
  parseArgument(

    typeof $argument ===
      "string"

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


/* =========================================================
 * URL 检查
 * ========================================================= */

if (
  !/^https?:\/\//i.test(
    TARGET
  )
) {

  doneError(
    `目标网址无效：\n${TARGET}`
  );

} else {

  start();

}


/* =========================================================
 * 读取策略组
 * ========================================================= */

function start() {

  const details =
    $surge
      .selectGroupDetails();


  if (
    !details ||

    !details.groups ||

    !details.groups[
      GROUP
    ]
  ) {

    const groups =
      details &&
      details.groups

        ? Object.keys(
            details.groups
          )

        : [];


    doneError(

      `找不到策略组：${GROUP}` +

      (
        groups.length

          ?
          `\n\n当前可用策略组：\n${groups.join("\n")}`

          :
          ""
      )

    );


    return;
  }


  /*
   * 只读取当前策略组第一层。
   *
   * 不递归展开。
   *
   *
   * 比如：
   *
   * 节点选择
   *
   * ├─ 香港节点
   * ├─ 日本节点
   * ├─ 美国节点
   * ├─ 台湾节点
   * └─ 落地机
   *
   * 就只测试这 5 个。
   */

  const policies =
    details
      .groups[
        GROUP
      ]
      .filter(

        policy =>
          policy &&

          !EXCLUDE.has(
            policy
          )

      );


  if (
    !policies.length
  ) {

    doneError(

      `策略组中没有可测试策略：\n${GROUP}`

    );


    return;
  }


  runBenchmark(
    policies
  );
}


/* =========================================================
 * 并发测试队列
 * ========================================================= */

function runBenchmark(
  policies
) {

  let cursor = 0;

  let active = 0;

  let finished = 0;


  const results = [];


  function pump() {

    while (

      active <
        CONCURRENCY

      &&

      cursor <
        policies.length

    ) {

      const policy =
        policies[
          cursor++
        ];


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


/* =========================================================
 * 测试一个策略
 * ========================================================= */

function testPolicy(
  policy,
  callback
) {

  const getSamples = [];

  const latencySamples = [];

  const getStatuses = [];

  const latencyStatuses = [];


  let getFailures = 0;

  let latencyFailures = 0;


  let lastGetError = "";

  let lastLatencyError = "";


  let round = 0;


  function nextRound() {

    if (
      round >= ROUNDS
    ) {

      callback({

        policy:
          policy,


        /* GET */

        getOk:
          getSamples.length > 0,


        getTime:
          getSamples.length

            ? median(
                getSamples
              )

            : null,


        getSuccesses:
          getSamples.length,


        getFailures:
          getFailures,


        getError:
          lastGetError,


        status:
          getStatuses.length

            ? getStatuses[
                getStatuses.length -
                1
              ]

            : 0,


        /* 延迟 */

        latencyOk:
          latencySamples.length > 0,


        latency:
          latencySamples.length

            ? median(
                latencySamples
              )

            : null,


        latencySuccesses:
          latencySamples.length,


        latencyFailures:
          latencyFailures,


        latencyError:
          lastLatencyError,


        latencyStatus:
          latencyStatuses.length

            ? latencyStatuses[
                latencyStatuses.length -
                1
              ]

            : 0

      });


      return;
    }


    round++;


    /*
     * 先测试 GET。
     *
     * 这样 HEAD 的预热不会影响
     * 第一次 GET 的实际请求时间。
     */

    testGet(

      policy,

      getResult => {

        if (
          getResult.ok
        ) {

          getSamples.push(
            getResult.time
          );


          getStatuses.push(
            getResult.status
          );

        } else {

          getFailures++;


          lastGetError =
            getResult.error ||
            "连接失败";

        }


        /*
         * GET 完成后
         * 再进行延迟测试。
         */

        testLatency(

          policy,

          latencyResult => {

            if (
              latencyResult.ok
            ) {

              latencySamples.push(
                latencyResult.time
              );


              latencyStatuses.push(
                latencyResult.status
              );

            } else {

              latencyFailures++;


              lastLatencyError =
                latencyResult.error ||
                "连接失败";

            }


            nextRound();

          }

        );

      }

    );

  }


  nextRound();
}


/* =========================================================
 * HTTP Headers
 * ========================================================= */

function commonHeaders() {

  return {

    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",


    "Cache-Control":
      "no-cache",


    "Pragma":
      "no-cache"

  };
}


/* =========================================================
 * GET 测试
 * ========================================================= */

function testGet(
  policy,
  callback
) {

  const started =
    Date.now();


  const headers =
    commonHeaders();


  headers["Accept"] =
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";


  $httpClient.get(

    {

      url:
        TARGET,


      /*
       * 强制走当前测试策略
       */

      policy:
        policy,


      timeout:
        REQUEST_TIMEOUT,


      headers:
        headers,


      /*
       * GET 模拟实际访问，
       * 所以允许正常跟随跳转。
       */

      "auto-redirect":
        true,


      "auto-cookie":
        false

    },


    (
      error,
      response,
      data
    ) => {

      /*
       * callback 执行时
       * GET 请求已经完成。
       */

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


        /*
         * 完整 GET 完成时间
         */

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


/* =========================================================
 * 延迟测试
 * ========================================================= */

/*
 * 延迟采用：
 *
 * HEAD #1
 * ↓
 * 预热连接
 *
 * HEAD #2
 * ↓
 * 正式计时
 *
 *
 * 第二次 HEAD 的耗时
 * 显示为“延迟”。
 */

function testLatency(
  policy,
  callback
) {

  /*
   * HEAD #1
   *
   * 只预热。
   * 不作为最终延迟。
   */

  $httpClient.head(

    {

      url:
        TARGET,


      policy:
        policy,


      timeout:
        REQUEST_TIMEOUT,


      headers:
        commonHeaders(),


      /*
       * 延迟只测这个 URL
       * 本身的响应。
       *
       * 不跟随 301/302。
       */

      "auto-redirect":
        false,


      "auto-cookie":
        false

    },


    (
      warmError,
      warmResponse
    ) => {

      if (
        warmError
      ) {

        callback({

          ok:
            false,


          error:
            String(
              warmError
            )

        });


        return;
      }


      /*
       * HEAD #2
       *
       * 正式开始计时。
       */

      const started =
        Date.now();


      $httpClient.head(

        {

          url:
            TARGET,


          policy:
            policy,


          timeout:
            REQUEST_TIMEOUT,


          headers:
            commonHeaders(),


          "auto-redirect":
            false,


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


            /*
             * 这里就是最终显示的：
             *
             * 延迟：xx ms
             */

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

  );
}


/* =========================================================
 * Panel 输出
 * ========================================================= */

function render(
  results
) {

  /*
   * 默认按照 GET 排名。
   *
   * GET 越快越靠前。
   */

  const sorted =
    results
      .slice()
      .sort(

        (
          a,
          b
        ) => {

          if (
            a.getOk &&
            b.getOk
          ) {

            return (
              a.getTime -
              b.getTime
            );

          }


          if (
            a.getOk
          ) {

            return -1;

          }


          if (
            b.getOk
          ) {

            return 1;

          }


          return 0;

        }

      );


  const successfulGets =
    sorted.filter(
      item =>
        item.getOk
    );


  /*
   * 本轮最快 GET
   */

  const fastestGet =
    successfulGets.length

      ? successfulGets[
          0
        ].getTime

      : 0;


  const lines = [];


  sorted
    .slice(
      0,
      TOP
    )
    .forEach(

      (
        item,
        index
      ) => {

        /*
         * 策略名称
         */

        lines.push(
          `${index + 1}. ${item.policy}`
        );


        /* =====================
         * GET
         * ===================== */

        if (
          item.getOk
        ) {

          let getLine =

            `   GET：${item.getTime} ms · ` +

            `${getSpeedLevel(
              item.getTime,
              fastestGet
            )} · ` +

            `${httpStatusText(
              item.status
            )}`;


          if (
            ROUNDS > 1
          ) {

            getLine +=
              ` · ${item.getSuccesses}/${ROUNDS}`;


            if (
              item.getFailures
            ) {

              getLine +=
                " ⚠︎";

            }

          }


          lines.push(
            getLine
          );

        } else {

          lines.push(

            `   GET：失败 · ${errorText(
              item.getError
            )}`

          );

        }


        /* =====================
         * 延迟
         * ===================== */

        if (
          item.latencyOk
        ) {

          let latencyLine =

            `   延迟：${item.latency} ms · ` +

            `${latencyLevel(
              item.latency
            )}` +

            `${headStatusText(
              item.latencyStatus
            )}`;


          if (
            ROUNDS > 1
          ) {

            latencyLine +=
              ` · ${item.latencySuccesses}/${ROUNDS}`;


            if (
              item.latencyFailures
            ) {

              latencyLine +=
                " ⚠︎";

            }

          }


          lines.push(
            latencyLine
          );

        } else {

          lines.push(

            `   延迟：失败 · ${errorText(
              item.latencyError
            )}`

          );

        }

      }

    );


  /*
   * 未显示项目
   */

  if (
    sorted.length >
    TOP
  ) {

    lines.push(

      `\n还有 ${
        sorted.length -
        TOP
      } 个策略未显示`

    );

  }


  /*
   * 输出 Panel
   */

  $done({

    title:
      "Web Node Benchmark",


    content:

      `目标：${hostOf(
        TARGET
      )}\n` +

      `策略组：${GROUP}\n` +

      `测试策略：${results.length}` +

      (
        ROUNDS > 1

          ? ` · 每项 ${ROUNDS} 次`

          : ""
      ) +

      `\n\n` +

      (
        lines.join("\n") ||

        "没有测试结果"
      ),


    style:

      successfulGets.length

        ? "good"

        : "error"

  });

}
