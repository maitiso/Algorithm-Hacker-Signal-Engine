"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const WS_URL =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const MARKETS = [
  { name: "Volatility 50", code: "R_50", color: "#22C55E" },
  { name: "Volatility 50 (1s)", code: "1HZ50V", color: "#22C55E" },
  { name: "Volatility 75", code: "R_75", color: "#EF4444" },
  { name: "Volatility 100", code: "R_100", color: "#22C55E" },
  { name: "Volatility 75 (1s)", code: "1HZ75V", color: "#EF4444" },
  { name: "Volatility 100 (1s)", code: "1HZ100V", color: "#22C55E" },
];

const PAIRS = [
  {
    id: "matchesDiffers",
    label: "MATCHES / DIFFERS",
    options: [
      ["matches", "MATCHES"],
      ["differs", "DIFFERS"],
    ],
  },
  {
    id: "underOver",
    label: "UNDER / OVER",
    options: [
      ["under", "UNDER"],
      ["over", "OVER"],
    ],
  },
  {
    id: "evenOdd",
    label: "EVEN / ODD",
    options: [
      ["even", "EVEN"],
      ["odd", "ODD"],
    ],
  },
  {
    id: "riseFall",
    label: "RISE / FALL",
    options: [
      ["rise", "RISE"],
      ["fall", "FALL"],
    ],
  },
];

function getLastDigit(price) {
  const text = String(price);
  const digits = text.replace(/\D/g, "");

  return digits.length
    ? Number(digits.at(-1))
    : null;
}

function analyze(digits, prices, contract, target) {
  if (digits.length < 30) {
    return {
      score: 0,
      pattern: "Collecting tick data",
    };
  }

  const recent = digits.slice(-30);
  const frequency = Array(10).fill(0);

  recent.forEach((d) => {
    frequency[d]++;
  });

  const evenRate =
    recent.filter((d) => d % 2 === 0).length /
    recent.length;

  const overRate =
    recent.filter((d) => d >= 5).length /
    recent.length;

  let score = 50;
  const patterns = [];

  if (
    recent.length >= 2 &&
    recent.at(-1) === recent.at(-2)
  ) {
    score += 8;
    patterns.push("repetition");
  }

  if (Math.max(...frequency) >= 5) {
    score += 7;
    patterns.push("digit cluster");
  }

  if (contract === "even" && evenRate > 0.55) {
    score += 12;
    patterns.push("even bias");
  }

  if (contract === "odd" && evenRate < 0.45) {
    score += 12;
    patterns.push("odd bias");
  }

  if (contract === "over" && overRate > 0.55) {
    score += 12;
    patterns.push("over bias");
  }

  if (contract === "under" && overRate < 0.45) {
    score += 12;
    patterns.push("under bias");
  }

  if (contract === "matches") {
    const rate = frequency[target] / recent.length;

    if (rate > 0.1) {
      score += 15;
      patterns.push(`digit ${target} concentration`);
    }
  }

  if (contract === "differs") {
    const rate = frequency[target] / recent.length;

    if (rate < 0.1) {
      score += 12;
      patterns.push(`digit ${target} scarcity`);
    }
  }

  if (
    (contract === "rise" || contract === "fall") &&
    prices.length >= 8
  ) {
    const p = prices.slice(-8);

    let rises = 0;
    let falls = 0;

    for (let i = 1; i < p.length; i++) {
      if (p[i] > p[i - 1]) rises++;
      if (p[i] < p[i - 1]) falls++;
    }

    if (contract === "rise" && rises >= 5) {
      score += 18;
      patterns.push("upward pressure");
    }

    if (contract === "fall" && falls >= 5) {
      score += 18;
      patterns.push("downward pressure");
    }
  }

  return {
    score: Math.min(99, score),
    pattern:
      patterns.length > 0
        ? patterns.slice(0, 3).join(" + ")
        : "mixed conditions",
  };
}

function predictionText(contract, target) {
  const values = {
    matches: `MATCHES ${target}`,
    differs: `DIFFERS ${target}`,
    under: "UNDER 5",
    over: "OVER 4",
    even: "EVEN",
    odd: "ODD",
    rise: "RISE",
    fall: "FALL",
  };

  return values[contract] || "WAITING";
}

function predictionSubtext(contract, target) {
  const values = {
    matches: `Last digit = ${target}`,
    differs: `Last digit ≠ ${target}`,
    under: "Last digit < 5 • wins on 0–4",
    over: "Last digit > 4 • wins on 5–9",
    even: "Last digit is even • 0, 2, 4, 6, 8",
    odd: "Last digit is odd • 1, 3, 5, 7, 9",
    rise: "Next price expected to rise",
    fall: "Next price expected to fall",
  };

  return values[contract] || "Waiting for analysis";
}

function badge(contract, target) {
  const values = {
    matches: `M${target}`,
    differs: `D${target}`,
    under: "U5",
    over: "O4",
    even: "EV",
    odd: "OD",
    rise: "RI",
    fall: "FA",
  };

  return values[contract] || "--";
}

export default function Home() {
  const socketRef = useRef(null);
  const reconnectRef = useRef(null);
  const mountedRef = useRef(false);

  const [symbol, setSymbol] = useState("R_50");
  const [contract, setContract] = useState("over");
  const [target, setTarget] = useState(7);

  const [prices, setPrices] = useState([]);
  const [digits, setDigits] = useState([]);

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Connecting...");
  const [error, setError] = useState("");
  const [serverMessage, setServerMessage] = useState("");
  const [tickCount, setTickCount] = useState(0);

  const [signals, setSignals] = useState([]);

  /*
   * Countdown is independent from incoming ticks.
   */
  const [entryAt, setEntryAt] = useState(
    Date.now() + 3000
  );

  const [entryCountdown, setEntryCountdown] =
    useState(3);

  const currentMarket =
    MARKETS.find((m) => m.code === symbol) ||
    MARKETS[0];

  /*
   * Start Deriv connection
   */
  const connect = () => {
    if (!mountedRef.current) return;

    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
    }

    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch {}
    }

    setConnected(false);
    setStatus("Connecting to Deriv...");
    setError("");
    setServerMessage("");

    let ws;

    try {
      ws = new WebSocket(WS_URL);
      socketRef.current = ws;
    } catch (err) {
      setStatus("WebSocket creation failed");
      setError(String(err));
      return;
    }

    ws.onopen = () => {
      if (!mountedRef.current) return;

      setConnected(true);
      setStatus("Connected");

      /*
       * IMPORTANT:
       * No product_type here.
       */

      ws.send(
        JSON.stringify({
          active_symbols: "brief",
          req_id: 1,
        })
      );

      ws.send(
        JSON.stringify({
          ticks_history: symbol,
          count: 200,
          end: "latest",
          style: "ticks",
          req_id: 2,
        })
      );

      ws.send(
        JSON.stringify({
          ticks: symbol,
          subscribe: 1,
          req_id: 3,
        })
      );
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;

      try {
        const data = JSON.parse(event.data);

        console.log("DERIV MESSAGE:", data);

        setServerMessage(
          data.msg_type || "message received"
        );

        if (data.error) {
          setError(
            data.error.message ||
              "Deriv API error"
          );

          setStatus("Deriv API error");
          return;
        }

        /*
         * Historical data
         */

        if (
          data.msg_type === "history" &&
          data.history?.prices
        ) {
          const historical =
            data.history.prices.map(Number);

          const historicalDigits =
            historical
              .map(getLastDigit)
              .filter(
                (d) => d !== null
              );

          setPrices(
            historical.slice(-300)
          );

          setDigits(
            historicalDigits.slice(-300)
          );

          setStatus(
            "Connected • History loaded"
          );
        }

        /*
         * LIVE TICK
         */

        if (
          data.msg_type === "tick" &&
          data.tick
        ) {
          const quote =
            Number(data.tick.quote);

          const digit =
            getLastDigit(quote);

          if (
            !Number.isFinite(quote) ||
            digit === null
          ) {
            return;
          }

          setPrices((previous) => [
            ...previous.slice(-299),
            quote,
          ]);

          setDigits((previous) => [
            ...previous.slice(-299),
            digit,
          ]);

          setTickCount(
            (previous) => previous + 1
          );

          /*
           * DO NOT reset the countdown here.
           */

          setStatus(
            "LIVE • Receiving ticks"
          );

          setError("");
        }
      } catch (err) {
        console.error(err);

        setError(
          "Could not parse Deriv response"
        );
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;

      setConnected(false);
      setStatus(
        "WebSocket connection error"
      );

      setError(
        "Browser could not establish the Deriv WebSocket connection."
      );
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;

      setConnected(false);
      setStatus(
        `Disconnected (${event.code})`
      );

      reconnectRef.current =
        setTimeout(() => {
          connect();
        }, 5000);
    };
  };

  /*
   * Connect / reconnect when market changes
   */

  useEffect(() => {
    mountedRef.current = true;

    connect();

    return () => {
      mountedRef.current = false;

      if (reconnectRef.current) {
        clearTimeout(
          reconnectRef.current
        );
      }

      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {}
      }
    };
  }, [symbol]);

  /*
   * REAL COUNTDOWN
   *
   * 3 → 2 → 1 → ENTER NOW
   */

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil(
          (entryAt - Date.now()) /
            1000
        )
      );

      setEntryCountdown(remaining);
    }, 100);

    return () => clearInterval(timer);
  }, [entryAt]);

  /*
   * Start a new prediction cycle
   */

  const restartEntryCountdown = () => {
    setEntryAt(
      Date.now() + 3000
    );
  };

  /*
   * Analysis
   */

  const analysis = useMemo(
    () =>
      analyze(
        digits,
        prices,
        contract,
        Number(target)
      ),
    [
      digits,
      prices,
      contract,
      target,
    ]
  );

  const strength =
    analysis.score >= 80
      ? "STRONG"
      : analysis.score >= 75
      ? "VALID"
      : analysis.score >= 60
      ? "WATCH"
      : "WAIT";

  /*
   * Signal history
   */

  useEffect(() => {
    if (
      analysis.score < 75 ||
      digits.length < 30 ||
      tickCount === 0
    ) {
      return;
    }

    const signal = {
      id:
        `${tickCount}-${contract}-${analysis.score}`,
      time:
        new Date().toLocaleTimeString(),
      type:
        predictionText(
          contract,
          Number(target)
        ),
      score: analysis.score,
      pattern: analysis.pattern,
    };

    setSignals((previous) => {
      if (
        previous.some(
          (item) =>
            item.id === signal.id
        )
      ) {
        return previous;
      }

      return [
        signal,
        ...previous,
      ].slice(0, 20);
    });
  }, [
    tickCount,
    analysis,
    contract,
    target,
    digits.length,
  ]);

  /*
   * Currently selected pair
   */

  const activePair =
    PAIRS.find((pair) =>
      pair.options.some(
        ([id]) =>
          id === contract
      )
    );

  const price = prices.at(-1);
  const lastDigit = digits.at(-1);

  return (
    <main className="app">

      {/* HEADER */}

      <header className="header">

        <div>
          <h1>
            ALGORITHM HACKER
          </h1>

          <p>
            SIGNAL ENGINE
          </p>
        </div>

        <div
          className={
            connected
              ? "status connected"
              : "status"
          }
        >
          ●{" "}
          {connected
            ? "LIVE"
            : status}
        </div>

      </header>

      {/* ERROR */}

      {error && (
        <div className="errorBox">
          DERIV: {error}
        </div>
      )}

      {/* API */}

      <div className="serverBox">
        API MESSAGE:{" "}
        {serverMessage ||
          "waiting..."}
      </div>

      {/* MARKET */}

      <section className="
          </div>
        </div>

        <div
          style={{
            background: "#1A1A1F",
            border: "1px solid #2A2A30",
            borderRadius: "14px",
            padding: "16px",
          }}
        >
          <div
            style={{
              color: "#9CA3AF",
              fontSize: "11px",
            }}
          >
            LIVE PRICE
          </div>

          <strong
            style={{
              fontSize: "20px",
            }}
          >
            {price ?? "—"}
          </strong>
        </div>

        <div
          style={{
            background: "#1A1A1F",
            border: "1px solid #2A2A30",
            borderRadius: "14px",
            padding: "16px",
          }}
        >
          <div
            style={{
              color: "#9CA3AF",
              fontSize: "11px",
            }}
          >
            LAST DIGIT
          </div>

          <strong
            style={{
              fontSize: "20px",
              color: "#2563EB",
            }}
          >
            {lastDigit ?? "—"}
          </strong>
        </div>
      </section>

      {/* SIGNAL CARD */}

      <section
        style={{
          background: "#1A1A1F",
          border: "1px solid #2A2A30",
          borderRadius: "20px",
          padding: "22px",
          marginBottom: "20px",
          boxShadow:
            "0 0 35px rgba(37,99,235,0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "15px",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "20px",
              }}
            >
              {market.name}
            </h2>

            <span
              style={{
                color: "#9CA3AF",
                fontSize: "12px",
              }}
            >
              {market.code}
            </span>
          </div>

          <div
            style={{
              color: connected
                ? "#22C55E"
                : "#EF4444",
              fontSize: "12px",
              fontWeight: 800,
            }}
          >
            ● LIVE
          </div>
        </div>

        <div
          style={{
            height: "80px",
            marginBottom: "15px",
          }}
        >
          <Sparkline
            prices={prices}
            color={market.chartColor}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            margin: "10px 0 18px",
          }}
        >
          <div
            style={{
              width: "90px",
              height: "90px",
              borderRadius: "50%",
              background: "#2563EB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
              fontWeight: 900,
              boxShadow:
                "0 0 35px rgba(37,99,235,0.35)",
            }}
          >
            {predictionBadge}
          </div>
        </div>

        <div
          style={{
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: "#9CA3AF",
              fontSize: "11px",
              letterSpacing: "1px",
            }}
          >
            PREDICTION
          </div>

          <div
            style={{
              fontSize: "26px",
              fontWeight: 900,
              marginTop: "5px",
            }}
          >
            {prediction}
          </div>

          <div
            style={{
              color: "#9CA3AF",
              fontSize: "13px",
              marginTop: "5px",
            }}
          >
            {predictionSubtext}
          </div>
        </div>

        {/* ENTRY COUNTDOWN */}

        <div
          style={{
            marginTop: "22px",
            background:
              entryCountdown === 0
                ? "rgba(34,197,94,0.12)"
                : "rgba(245,158,11,0.10)",
            border:
              entryCountdown === 0
                ? "1px solid #22C55E"
                : "1px solid #F59E0B",
            borderRadius: "16px",
            padding: "16px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: "#9CA3AF",
              fontSize: "11px",
              letterSpacing: "1px",
            }}
          >
            ENTRY
          </div>

          <div
            style={{
              color:
                entryCountdown === 0
                  ? "#22C55E"
                  : "#FBBF24",
              fontSize: "24px",
              fontWeight: 900,
              marginTop: "4px",
            }}
          >
            {entryCountdown === 0
              ? "⚡ ENTER NOW"
              : `IN ${entryCountdown}s`}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "18px",
          }}
        >
          <span
            style={{
              color: "#FBBF24",
              fontWeight: 800,
            }}
          >
            Confidence: {analysis.score}%
          </span>

          <span
            style={{
              color:
                analysis.score >= 75
                  ? "#22C55E"
                  : "#FBBF24",
              fontWeight: 900,
            }}
          >
            SIGNAL ENGINE {strength}
          </span>
        </div>
      </section>

      {/* CURRENT ANALYSIS */}

      <section
        style={{
          background: "#1A1A1F",
          border: "1px solid #2A2A30",
          borderRadius: "16px",
          padding: "18px",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            color: "#9CA3AF",
            fontSize: "11px",
            marginBottom: "6px",
          }}
        >
          CURRENT ANALYSIS
        </div>

        <h3
          style={{
            margin: "0 0 10px",
            fontSize: "18px",
          }}
        >
          {analysis.pattern}
        </h3>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <strong
            style={{
              color:
                analysis.score >= 75
                  ? "#22C55E"
                  : "#FBBF24",
              fontSize: "24px",
            }}
          >
            {analysis.score}%
          </strong>

          <span
            style={{
              color: "#9CA3AF",
              fontSize: "12px",
            }}
          >
            MODEL STATUS: {strength}
          </span>
        </div>
      </section>

      {/* RECENT DIGITS */}

      <section
        style={{
          background: "#1A1A1F",
          border: "1px solid #2A2A30",
          borderRadius: "16px",
          padding: "18px",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            color: "#9CA3AF",
            fontSize: "11px",
            marginBottom: "6px",
          }}
        >
          LAST DIGIT ANALYSIS
        </div>

        <h3
          style={{
            margin: "0 0 12px",
          }}
        >
          Recent Digits
        </h3>

        <div
          style={{
            color: "#9CA3AF",
            fontSize: "12px",
            marginBottom: "12px",
          }}
        >
          {digits.length} ticks
        </div>

        <div
          style={{
            display: "flex",
            gap: "6px",
            flexWrap: "wrap",
          }}
        >
          {digits
            .slice(-30)
            .map((digit, index) => (
              <span
                key={`${index}-${digit}`}
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "7px",
                  background:
                    digit === lastDigit
                      ? "#2563EB"
                      : "#0D0D0F",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: 800,
                }}
              >
                {digit}
              </span>
            ))}
        </div>
      </section>

      {/* SIGNAL HISTORY */}

      <section
        style={{
          background: "#1A1A1F",
          border: "1px solid #2A2A30",
          borderRadius: "16px",
          padding: "18px",
        }}
      >
        <h2
          style={{
            margin: "0 0 15px",
            fontSize: "18px",
          }}
        >
          Signal History
        </h2>

        {signals.length === 0 ? (
          <div
            style={{
              color: "#9CA3AF",
              textAlign: "center",
              padding: "20px",
            }}
          >
            Waiting for a valid signal...
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {signals.map((signal) => (
              <div
                key={signal.id}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "80px 1fr auto",
                  gap: "10px",
                  alignItems: "center",
                  background: "#0D0D0F",
                  border: "1px solid #2A2A30",
                  borderRadius: "10px",
                  padding: "10px",
                }}
              >
                <span
                  style={{
                    color: "#9CA3AF",
                    fontSize: "11px",
                  }}
                >
                  {signal.time}
                </span>

                <div>
                  <strong>
                    {signal.type}
                  </strong>

                  <div
                    style={{
                      color: "#9CA3AF",
                      fontSize: "11px",
                      marginTop: "2px",
                    }}
                  >
                    {signal.pattern}
                  </div>
                </div>

                <strong
                  style={{
                    color: "#22C55E",
                  }}
                >
                  {signal.score}%
                </strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer
        style={{
          textAlign: "center",
          color: "#6B7280",
          fontSize: "11px",
          marginTop: "20px",
        }}
      >
        ALGORITHM HACKER • SIGNAL-ONLY MODE • REAL DERIV DATA
      </footer>
    </main>
  );
}