"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const WS_URL =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const CONTRACTS = [
  ["matches", "MATCHES"],
  ["differs", "DIFFERS"],
  ["under", "UNDER"],
  ["over", "OVER"],
  ["even", "EVEN"],
  ["odd", "ODD"],
  ["rise", "RISE"],
  ["fall", "FALL"],
];

const SYMBOLS = [
  "R_50",
  "R_75",
  "R_100",
  "1HZ50V",
  "1HZ75V",
  "1HZ100V",
];

function getLastDigit(price) {
  const text = String(price);
  const digits = text.replace(/\D/g, "");

  if (!digits.length) return null;

  return Number(digits.at(-1));
}

function calculateAnalysis(
  digits,
  prices,
  contract,
  target
) {
  if (digits.length < 30) {
    return {
      score: 0,
      pattern: "Collecting tick data",
    };
  }

  const recent = digits.slice(-30);

  let score = 50;
  const patterns = [];

  const evenRate =
    recent.filter((d) => d % 2 === 0).length /
    recent.length;

  const highRate =
    recent.filter((d) => d >= 5).length /
    recent.length;

  const frequency = Array(10).fill(0);

  recent.forEach((digit) => {
    frequency[digit]++;
  });

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

  if (
    contract === "even" &&
    evenRate > 0.55
  ) {
    score += 12;
    patterns.push("even bias");
  }

  if (
    contract === "odd" &&
    evenRate < 0.45
  ) {
    score += 12;
    patterns.push("odd bias");
  }

  if (
    contract === "over" &&
    highRate > 0.55
  ) {
    score += 12;
    patterns.push("over bias");
  }

  if (
    contract === "under" &&
    highRate < 0.45
  ) {
    score += 12;
    patterns.push("under bias");
  }

  if (contract === "matches") {
    const rate =
      frequency[target] / recent.length;

    if (rate > 0.1) {
      score += 15;
      patterns.push(
        `digit ${target} concentration`
      );
    }
  }

  if (contract === "differs") {
    const rate =
      frequency[target] / recent.length;

    if (rate < 0.1) {
      score += 12;
      patterns.push(
        `digit ${target} scarcity`
      );
    }
  }

  if (
    (contract === "rise" ||
      contract === "fall") &&
    prices.length >= 8
  ) {
    const recentPrices =
      prices.slice(-8);

    let rises = 0;
    let falls = 0;

    for (
      let i = 1;
      i < recentPrices.length;
      i++
    ) {
      if (
        recentPrices[i] >
        recentPrices[i - 1]
      ) {
        rises++;
      }

      if (
        recentPrices[i] <
        recentPrices[i - 1]
      ) {
        falls++;
      }
    }

    if (
      contract === "rise" &&
      rises >= 5
    ) {
      score += 18;
      patterns.push(
        "upward pressure"
      );
    }

    if (
      contract === "fall" &&
      falls >= 5
    ) {
      score += 18;
      patterns.push(
        "downward pressure"
      );
    }
  }

  return {
    score: Math.min(99, score),
    pattern:
      patterns.length > 0
        ? patterns
            .slice(0, 3)
            .join(" + ")
        : "mixed conditions",
  };
}

function MiniChart({ prices }) {
  const data = prices.slice(-30);

  if (data.length < 2) {
    return (
      <div className="miniChartEmpty">
        Waiting for chart data...
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x =
        (index /
          Math.max(data.length - 1, 1)) *
        100;

      const y =
        38 -
        ((value - min) / range) *
          32;

      return `${x},${y}`;
    })
    .join(" ");

  const rising =
    data.at(-1) >= data.at(0);

  return (
    <svg
      className="miniChart"
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={
          rising
            ? "#22C55E"
            : "#EF4444"
        }
        strokeWidth="1.8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function SignalCard({
  title,
  code,
  badge,
  prediction,
  description,
  confidence,
  prices,
  accent,
  entrySeconds,
  onCountdownComplete,
}) {
  const [seconds, setSeconds] =
    useState(entrySeconds);

  useEffect(() => {
    setSeconds(entrySeconds);
  }, [entrySeconds]);

  useEffect(() => {
    if (seconds <= 0) {
      onCountdownComplete?.();
      return;
    }

    const timer = setTimeout(() => {
      setSeconds(
        (value) => value - 1
      );
    }, 1000);

    return () => clearTimeout(timer);
  }, [seconds, onCountdownComplete]);

  const active = confidence >= 75;

  return (
    <div
      className={`signalCard ${
        active ? "signalCardActive" : ""
      }`}
      style={{
        "--accent": accent,
      }}
    >
      <div className="cardTop">
        <div>
          <h2>{title}</h2>
          <span>{code}</span>
        </div>

        <div className="liveStatus">
          <span className="pin">●</span>
          <span className="liveDot" />
          LIVE
        </div>
      </div>

      <div className="chartArea">
        <MiniChart prices={prices} />
      </div>

      <div
        className="predictionCircle"
        style={{
          background: accent,
        }}
      >
        {badge}
      </div>

      <div className="predictionBlock">
        <span className="predictionLabel">
          PREDICTION
        </span>

        <strong>
          {prediction}
        </strong>

        <small>
          {description}
        </small>
      </div>

      <div
        className={`entryBox ${
          seconds === 0
            ? "entryNow"
            : ""
        }`}
      >
        <span>ENTRY</span>

        {seconds === 0 ? (
          <strong>
            ⚡ ENTER NOW
          </strong>
        ) : (
          <strong>
            IN {seconds}s
          </strong>
        )}
      </div>

      <div className="confidenceRow">
        <span>
          Confidence
        </span>

        <strong>
          {confidence}%
        </strong>
      </div>

      <div className="confidenceBar">
        <div
          style={{
            width: `${confidence}%`,
            background: accent,
          }}
        />
      </div>

      <div className="cardFooter">
        <span>
          SIGNAL ENGINE
        </span>

        <span>
          {active
            ? "VALID SETUP"
            : "WATCH"}
        </span>
      </div>
    </div>
  );
}

export default function Home() {
  const socketRef =
    useRef(null);

  const reconnectRef =
    useRef(null);

  const mountedRef =
    useRef(true);

  const [symbol, setSymbol] =
    useState("R_50");

  const [contract, setContract] =
    useState("over");

  const [target, setTarget] =
    useState(7);

  const [prices, setPrices] =
    useState([]);

  const [digits, setDigits] =
    useState([]);

  const [connected, setConnected] =
    useState(false);

  const [status, setStatus] =
    useState("Connecting...");

  const [error, setError] =
    useState("");

  const [serverMessage, setServerMessage] =
    useState("");

  const [tickCount, setTickCount] =
    useState(0);

  const [signals, setSignals] =
    useState([]);

  const [entryCycle, setEntryCycle] =
    useState(0);

  const connect = () => {
    if (!mountedRef.current)
      return;

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

    setConnected(false);
    setStatus(
      "Connecting to Deriv..."
    );
    setError("");
    setServerMessage("");

    let ws;

    try {
      ws = new WebSocket(
        WS_URL
      );

      socketRef.current = ws;
    } catch (err) {
      setStatus(
        "WebSocket creation failed"
      );

      setError(
        String(err)
      );

      return;
    }

    ws.onopen = () => {
      if (!mountedRef.current)
        return;

      setConnected(true);
      setStatus("Connected");
      setError("");

      ws.send(
        JSON.stringify({
          active_symbols:
            "brief",
          req_id: 1,
        })
      );

      ws.send(
        JSON.stringify({
          ticks_history:
            symbol,
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

    ws.onmessage = (
      event
    ) => {
      if (!mountedRef.current)
        return;

      try {
        const data =
          JSON.parse(
            event.data
          );

        console.log(
          "DERIV:",
          data
        );

        setServerMessage(
          data.msg_type ||
            "message"
        );

        if (data.error) {
          setError(
            data.error
              .message ||
              "Deriv API error"
          );

          setStatus(
            "Deriv API error"
          );

          return;
        }

        if (
          data.msg_type ===
          "active_symbols"
        ) {
          const exists =
            data.active_symbols?.some(
              (item) =>
                item.symbol ===
                symbol
            );

          if (!exists) {
            setError(
              `${symbol} unavailable`
            );
          }
        }

        if (
          data.msg_type ===
            "history" &&
          data.history?.prices
        ) {
          const historical =
            data.history.prices.map(
              Number
            );

          const historicalDigits =
            historical
              .map(
                getLastDigit
              )
              .filter(
                (digit) =>
                  digit !== null
              );

          setPrices(
            historical.slice(
              -300
            )
          );

          setDigits(
            historicalDigits.slice(
              -300
            )
          );

          setStatus(
            "Connected • History loaded"
          );
        }

        if (
          data.msg_type ===
            "tick" &&
          data.tick
        ) {
          const quote =
            Number(
              data.tick.quote
            );

          const digit =
            getLastDigit(
              quote
            );

          if (
            !Number.isFinite(
              quote
            ) ||
            digit === null
          ) {
            return;
          }

          setPrices(
            (previous) => [
              ...previous.slice(
                -299
              ),
              quote,
            ]
          );

          setDigits(
            (previous) => [
              ...previous.slice(
                -299
              ),
              digit,
            ]
          );

          setTickCount(
            (previous) =>
              previous + 1
          );

          setStatus(
            "LIVE • Receiving ticks"
          );

          setError("");
        }
      } catch {
        setError(
          "Could not parse Deriv response"
        );
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current)
        return;

      setConnected(false);

      setStatus(
        "WebSocket connection error"
      );

      setError(
        "Could not connect to Deriv."
      );
    };

    ws.onclose = (
      event
    ) => {
      if (!mountedRef.current)
        return;

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

  useEffect(() => {
    mountedRef.current = true;

    connect();

    return () => {
      mountedRef.current =
        false;

      if (
        reconnectRef.current
      ) {
        clearTimeout(
          reconnectRef.current
        );
      }

      if (
        socketRef.current
      ) {
        try {
          socketRef.current.close();
        } catch {}
      }
    };
  }, [symbol]);

  const analysis =
    useMemo(
      () =>
        calculateAnalysis(
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

  const underAnalysis =
    useMemo(
      () =>
        calculateAnalysis(
          digits,
          prices,
          "under",
          5
        ),
      [digits, prices]
    );

  const overAnalysis =
    useMemo(
      () =>
        calculateAnalysis(
          digits,
          prices,
          "over",
          4
        ),
      [digits, prices]
    );

  const differsAnalysis =
    useMemo(
      () =>
        calculateAnalysis(
          digits,
          prices,
          "differs",
          Number(target)
        ),
      [
        digits,
        prices,
        target,
      ]
    );

  useEffect(() => {
    if (
      analysis.score < 75 ||
      digits.length < 30 ||
      tickCount === 0
    ) {
      return;
    }

    const label =
      CONTRACTS.find(
        ([id]) =>
          id === contract
      )?.[1];

    const signal = {
      id:
        `${tickCount}-${contract}-${analysis.score}`,
      time:
        new Date().toLocaleTimeString(),
      type: label,
      score:
        analysis.score,
      pattern:
        analysis.pattern,
    };

    setSignals(
      (previous) => {
        if (
          previous.some(
            (item) =>
              item.id ===
              signal.id
          )
        ) {
          return previous;
        }

        return [
          signal,
          ...previous,
        ].slice(0, 20);
      }
    );
  }, [
    tickCount,
    analysis,
    contract,
    digits.length,
  ]);

  const price =
    prices.at(-1);

  const lastDigit =
    digits.at(-1);

  /*
   * New countdown cycle whenever
   * the live analysis reaches a valid
   * signal threshold.
   *
   * This is a UI timing window,
   * not a guarantee of outcome.
   */

  useEffect(() => {
    if (
      analysis.score >= 75 &&
      digits.length >= 30
    ) {
      setEntryCycle(
        (value) => value + 1
      );
    }
  }, [
    tickCount,
    analysis.score >= 75,
  ]);

  const countdownSeed =
    useMemo(() => {
      return (
        1 +
        (Math.abs(
          tickCount * 17 +
            Number(lastDigit || 0)
        ) %
          5)
      );
    }, [
      tickCount,
      lastDigit,
    ]);

  return (
    <main className="app">

      <div className="demoBanner">
        ⚠️ SIGNAL ENGINE • REAL DERIV
        DATA • SIGNAL-ONLY • NO TRADE
        EXECUTION
      </div>

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
          <span className="liveDot" />

          {connected
            ? "LIVE"
            : "OFFLINE"}
        </div>

      </header>

      {error && (
        <div className="errorBox">
          DERIV: {error}
        </div>
      )}

      <div className="serverBox">
        API MESSAGE:{" "}
        {serverMessage ||
          "waiting..."}
      </div>

      <section className="controls">

        <label>
          MARKET

          <select
            value={symbol}
            onChange={(e) =>
              setSymbol(
                e.target.value
              )
            }
          >
            {SYMBOLS.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              )
            )}
          </select>
        </label>

        <label>
          TARGET DIGIT

          <input
            type="number"
            min="0"
            max="9"
            value={target}
            onChange={(e) =>
              setTarget(
                e.target.value
              )
            }
          />
        </label>

        <button
          className="reconnectButton"
          onClick={connect}
        >
          RECONNECT
        </button>

      </section>

      <section className="tabs">

        {CONTRACTS.map(
          ([id, label]) => (
            <button
              key={id}
              className={
                contract === id
                  ? "tab active"
                  : "tab"
              }
              onClick={() =>
                setContract(id)
              }
            >
              {label}
            </button>
          )
        )}

      </section>

      <section className="marketSummary">

        <div>
          <span>
            MARKET
          </span>

          <strong>
            {symbol}
          </strong>
        </div>

        <div>
          <span>
            LIVE PRICE
          </span>

          <strong>
            {price ?? "—"}
          </strong>
        </div>

        <div>
          <span>
            LAST DIGIT
          </span>

          <strong className="bigDigit">
            {lastDigit ?? "—"}
          </strong>
        </div>

        <div>
          <span>
            TICKS
          </span>

          <strong>
            {tickCount}
          </strong>
        </div>

      </section>

      <section className="signalGrid">

        <SignalCard
          title="Volatility 10 (1s)"
          code="1HZ10V"
          badge="U5"
          prediction="UNDER 5"
          description="Last digit < 5 • wins on 0–4"
          confidence={
            underAnalysis.score
          }
          prices={prices}
          accent="#00D4AA"
          entrySeconds={
            countdownSeed
          }
        />

        <SignalCard
          title="Volatility 10 (1s)"
          code="1HZ10V"
          badge="04"
          prediction="OVER 4"
          description="Last digit > 4 • wins on 5–9"
          confidence={
            overAnalysis.score
          }
          prices={prices}
          accent="#F59E0B"
          entrySeconds={
            Math.max(
              1,
              (countdownSeed + 2) %
                6
            )
          }
        />

        <SignalCard
          title="Volatility 10 (1s)"
          code="1HZ10V"
          badge={`D${target}`}
          prediction={`DIFFERS ${target}`}
          description={`Last digit ≠ ${target}`}
          confidence={
            differsAnalysis.score
          }
          prices={prices}
          accent="#2563EB"
          entrySeconds={
            Math.max(
              1,
              (countdownSeed + 4) %
                6
            )
          }
        />

      </section>

      <section className="analysisPanel">

        <div className="analysisHeader">
          <div>
            <span>
              CURRENT ANALYSIS
            </span>

            <h2>
              {analysis.pattern}
            </h2>
          </div>

          <div className="scoreLarge">
            {analysis.score}%
          </div>
        </div>

        <div className="analysisBar">
          <div
            style={{
              width:
                `${analysis.score}%`,
            }}
          />
        </div>

        <div className="analysisMeta">

          <span>
            MODEL STATUS
          </span>

          <strong>
            {analysis.score >= 75
              ? "VALID SETUP"
              : analysis.score >=
                60
              ? "WATCH"
              : "WAITING"}
          </strong>

        </div>

      </section>

      <section className="digitsPanel">

        <div className="sectionHeading">
          <div>
            <span>
              LAST DIGIT ANALYSIS
            </span>

            <h2>
              Recent Digits
            </h2>
          </div>

          <div className="digitCount">
            {digits.length} ticks
          </div>
        </div>

        <div className="digits">

          {digits
            .slice(-40)
            .map(
              (digit, index) => (
                <span
                  key={`${index}-${digit}`}
                  className={
                    digit ===
                    lastDigit
                      ? "digit activeDigit"
                      : "digit"
                  }
                >
                  {digit}
                </span>
              )
            )}

        </div>

      </section>

      <section className="history">

        <div className="sectionHeading">

          <div>
            <span>
              SIGNAL LOG
            </span>

            <h2>
              Signal History
            </h2>
          </div>

        </div>

        {signals.length === 0 ? (
          <div className="empty">
            Waiting for a valid signal...
          </div>
        ) : (
          <div className="historyList">

            {signals.map(
              (signal) => (
                <div
                  className="historyRow"
                  key={signal.id}
                >

                  <span>
                    {signal.time}
                  </span>

                  <strong>
                    {signal.type}
                  </strong>

                  <b>
                    {signal.score}%
                  </b>

                  <small>
                    {signal.pattern}
                  </small>

                </div>
              )
            )}

          </div>
        )}

      </section>

      <footer>
        ALGORITHM HACKER • SIGNAL-ONLY
        MODE • REAL DERIV MARKET DATA
      </footer>

    </main>
  );
}