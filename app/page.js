"use client";

import { useEffect, useRef, useState } from "react";

const WS_URL =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const PAIRS = [
  {
    id: "matches_differs",
    label: "MATCHES / DIFFERS",
    left: "MATCHES",
    right: "DIFFERS",
  },
  {
    id: "under_over",
    label: "UNDER / OVER",
    left: "UNDER",
    right: "OVER",
  },
  {
    id: "even_odd",
    label: "EVEN / ODD",
    left: "EVEN",
    right: "ODD",
  },
  {
    id: "rise_fall",
    label: "RISE / FALL",
    left: "RISE",
    right: "FALL",
  },
];

const MARKETS = [
  { name: "Volatility 50", code: "R_50", color: "#22C55E" },
  { name: "Volatility 50 (1s)", code: "1HZ50V", color: "#22C55E" },
  { name: "Volatility 75", code: "R_75", color: "#EF4444" },
  { name: "Volatility 75 (1s)", code: "1HZ75V", color: "#EF4444" },
  { name: "Volatility 100", code: "R_100", color: "#22C55E" },
  { name: "Volatility 100 (1s)", code: "1HZ100V", color: "#22C55E" },
];

function lastDigit(price) {
  const digits = String(price).replace(/\D/g, "");
  return digits.length
    ? Number(digits.at(-1))
    : null;
}

function analyze(
  digits,
  prices,
  pair,
  target
) {
  if (digits.length < 30) {
    return {
      left: 0,
      right: 0,
      winner: "WAIT",
      pattern: "Collecting tick data",
    };
  }

  const recent = digits.slice(-30);
  const frequency = Array(10).fill(0);

  recent.forEach(
    (d) => frequency[d]++
  );

  let left = 50;
  let right = 50;
  const patterns = [];

  if (pair === "matches_differs") {
    const rate =
      frequency[target] /
      recent.length;

    left = 35 + rate * 180;
    right = 70 - rate * 100;

    patterns.push(
      rate >= 0.1
        ? `digit ${target} concentration`
        : `digit ${target} scarcity`
    );
  }

  if (pair === "under_over") {
    const under =
      recent.filter(
        (d) => d < target
      ).length /
      recent.length;

    const over =
      recent.filter(
        (d) => d >= target
      ).length /
      recent.length;

    left = 40 + under * 60;
    right = 40 + over * 60;

    patterns.push(
      under > over
        ? "under bias"
        : "over bias"
    );
  }

  if (pair === "even_odd") {
    const even =
      recent.filter(
        (d) => d % 2 === 0
      ).length /
      recent.length;

    const odd = 1 - even;

    left = 40 + even * 60;
    right = 40 + odd * 60;

    patterns.push(
      even > odd
        ? "even bias"
        : "odd bias"
    );
  }

  if (pair === "rise_fall") {
    const p = prices.slice(-10);

    let rises = 0;
    let falls = 0;

    for (let i = 1; i < p.length; i++) {
      if (p[i] > p[i - 1]) rises++;
      if (p[i] < p[i - 1]) falls++;
    }

    left = 40 + (rises / 9) * 60;
    right = 40 + (falls / 9) * 60;

    patterns.push(
      rises > falls
        ? "upward pressure"
        : falls > rises
        ? "downward pressure"
        : "balanced movement"
    );
  }

  left = Math.min(99, Math.round(left));
  right = Math.min(99, Math.round(right));

  let winner = "WAIT";

  if (Math.max(left, right) >= 75) {
    winner =
      left >= right
        ? "LEFT"
        : "RIGHT";
  }

  return {
    left,
    right,
    winner,
    pattern: patterns.join(" + "),
  };
}

function Chart({ prices, color }) {
  if (!prices.length) {
    return (
      <div className="chartEmpty">
        Waiting for ticks...
      </div>
    );
  }

  const values = prices.slice(-25);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((value, i) => {
      const x =
        (i /
          Math.max(values.length - 1, 1)) *
        100;

      const y =
        90 -
        ((value - min) / range) * 75;

      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="chart"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
      />
    </svg>
  );
}

function Card({
  market,
  data,
  pair,
  target,
  onSwitch,
}) {
  const price = data.prices.at(-1);
  const digit = data.digits.at(-1);

  const leftName = pair.left;
  const rightName = pair.right;

  const winner =
    data.analysis.winner;

  const signal =
    winner === "LEFT"
      ? leftName
      : winner === "RIGHT"
      ? rightName
      : "WAIT";

  const confidence =
    winner === "LEFT"
      ? data.analysis.left
      : winner === "RIGHT"
      ? data.analysis.right
      : Math.max(
          data.analysis.left,
          data.analysis.right
        );

  return (
    <article
      className={`card ${
        signal !== "WAIT"
          ? "signalCard"
          : ""
      }`}
    >
      <div className="cardHeader">
        <button
          className="marketButton"
          onClick={onSwitch}
        >
          <strong>
            {market.name}
          </strong>

          <span>
            {market.code} ▾
          </span>
        </button>

        <span
          className={
            data.connected
              ? "live"
              : "offline"
          }
        >
          ●{" "}
          {data.connected
            ? "LIVE"
            : "OFFLINE"}
        </span>
      </div>

      <div className="chartBox">
        <Chart
          prices={data.prices}
          color={market.color}
        />
      </div>

      <div className="price">
        {price ?? "—"}
      </div>

      <div className="digitCircle">
        {digit ?? "—"}
      </div>

      <div className="label">
        PREDICTION
      </div>

      <div className="pair">
        <div
          className={
            winner === "LEFT"
              ? "side selected"
              : "side"
          }
        >
          <span>{leftName}</span>
          <strong>
            {data.analysis.left}%
          </strong>
        </div>

        <div
          className={
            winner === "RIGHT"
              ? "side selected"
              : "side"
          }
        >
          <span>{rightName}</span>
          <strong>
            {data.analysis.right}%
          </strong>
        </div>
      </div>

      <div className="prediction">
        {signal}
        {signal !== "WAIT" &&
          pair.id ===
            "under_over" &&
          ` ${target}`}
        {signal !== "WAIT" &&
          pair.id ===
            "matches_differs" &&
          ` ${target}`}
      </div>

      <div className="pattern">
        {data.analysis.pattern}
      </div>

      <div className="confidence">
        <span>
          CONFIDENCE
        </span>

        <strong>
          {confidence}%
        </strong>
      </div>

      <div className="entry">
        {data.signalActive ? (
          <>
            <small>
              ENTRY SIGNAL
            </small>

            <strong className="enter">
              ⚡ ENTER NOW
            </strong>
          </>
        ) : data.countdown > 0 ? (
          <>
            <small>
              ENTRY IN
            </small>

            <strong>
              {data.countdown}s
            </strong>
          </>
        ) : (
          <>
            <small>
              STATUS
            </small>

            <strong>
              WAITING
            </strong>
          </>
        )}
      </div>

      <button
        className="switch"
        onClick={onSwitch}
      >
        SWITCH MARKET
      </button>
    </article>
  );
}

export default function Dashboard() {
  const [activePair, setActivePair] =
    useState(
      "under_over"
    );

  const [target, setTarget] =
    useState(5);

  const [selectedMarkets, setSelectedMarkets] =
    useState([
      MARKETS[0],
      MARKETS[1],
      MARKETS[2],
    ]);

  const [data, setData] =
    useState({});

  const [selector, setSelector] =
    useState(null);

  const sockets =
    useRef({});

  const pair =
    PAIRS.find(
      (p) => p.id === activePair
    );

  function connect(market) {
    const symbol = market.code;

    if (sockets.current[symbol]) {
      try {
        sockets.current[
          symbol
        ].close();
      } catch {}
    }

    let ws;

    try {
      ws = new WebSocket(
        WS_URL
      );
    } catch {
      return;
    }

    sockets.current[symbol] = ws;

    ws.onopen = () => {
      setData((prev) => ({
        ...prev,
        [symbol]: {
          ...(prev[symbol] || {}),
          connected: true,
        },
      }));

      ws.send(
        JSON.stringify({
          ticks_history: symbol,
          count: 200,
          end: "latest",
          style: "ticks",
          req_id: 1,
        })
      );

      ws.send(
        JSON.stringify({
          ticks: symbol,
          subscribe: 1,
          req_id: 2,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const message =
          JSON.parse(
            event.data
          );

        if (
          message.error
        ) {
          console.error(
            "Deriv:",
            message.error.message
          );
          return;
        }

        if (
          message.msg_type ===
          "history"
        ) {
          const prices =
            (
              message.history
                ?.prices || []
            ).map(Number);

          const digits =
            prices
              .map(lastDigit)
              .filter(
                (d) => d !== null
              );

          setData((prev) => ({
            ...prev,
            [symbol]: {
              ...(prev[symbol] || {}),
              prices,
              digits,
              connected: true,
              analysis:
                analyze(
                  digits,
                  prices,
                  activePair,
                  target
                ),
            },
          }));
        }

        if (
          message.msg_type ===
          "tick"
        ) {
          const quote =
            Number(
              message.tick?.quote
            );

          if (
            !Number.isFinite(
              quote
            )
          ) {
            return;
          }

          setData((prev) => {
            const old =
              prev[symbol] || {};

            const prices = [
              ...(old.prices || []),
              quote,
            ].slice(-300);

            const digit =
              lastDigit(quote);

            const digits = [
              ...(old.digits || []),
              digit,
            ].slice(-300);

            return {
              ...prev,
              [symbol]: {
                ...old,
                prices,
                digits,
                connected: true,
                analysis:
                  analyze(
                    digits,
                    prices,
                    activePair,
                    target
                  ),
              },
            };
          });
        }
      } catch (error) {
        console.error(error);
      }
    };

    ws.onclose = () => {
      setData((prev) => ({
        ...prev,
        [symbol]: {
          ...(prev[symbol] || {}),
          connected: false,
        },
      }));
    };
  }

  useEffect(() => {
    selectedMarkets.forEach(
      connect
    );

    return () => {
      Object.values(
        sockets.current
      ).forEach((ws) => {
        try {
          ws.close();
        } catch {}
      });
    };
  }, [selectedMarkets]);

  /*
   * Update analysis when
   * the selected pair changes.
   */
  useEffect(() => {
    setData((prev) => {
      const next = {
        ...prev,
      };

      Object.keys(next).forEach(
        (symbol) => {
          const item =
            next[symbol];

          if (!item?.digits)
            return;

          next[symbol] = {
            ...item,
            analysis:
              analyze(
                item.digits,
                item.prices,
                activePair,
                target
              ),
          };
        }
      );

      return next;
    });
  }, [
    activePair,
    target,
  ]);

  /*
   * Start countdown ONLY
   * when a valid signal appears.
   *
   * It does not restart
   * because a new tick arrived.
   */
  useEffect(() => {
    selectedMarkets.forEach(
      (market) => {
        const item =
          data[market.code];

        if (!item) return;

        if (
          item.digits?.length <
          30
        ) {
          return;
        }

        const confidence =
          Math.max(
            item.analysis?.left ||
              0,
            item.analysis?.right ||
              0
          );

        if (
          confidence >= 75 &&
          !item.countdown &&
          !item.signalActive
        ) {
          setData((prev) => ({
            ...prev,
            [market.code]: {
              ...prev[
                market.code
              ],
              countdown: 4,
              signalActive: false,
            },
          }));
        }
      }
    );
  }, [data, selectedMarkets]);

  /*
   * Stable countdown.
   */
  useEffect(() => {
    const timer =
      setInterval(() => {
        setData((prev) => {
          const next = {
            ...prev,
          };

          Object.keys(next).forEach(
            (symbol) => {
              const item =
                next[symbol];

              if (
                !item ||
                !item.countdown
              ) {
                return;
              }

              const remaining =
                item.countdown - 1;

              next[symbol] = {
                ...item,
                countdown:
                  remaining,
                signalActive:
                  remaining === 0,
              };
            }
          );

          return next;
        });
      }, 1000);

    return () =>
      clearInterval(timer);
  }, []);

  function changeMarket(
    index,
    market
  ) {
    setSelectedMarkets(
      (prev) => {
        const next = [
          ...prev,
        ];

        next[index] =
          market;

        return next;
      }
    );

    setSelector(null);
  }

  return (
    <>
      <style jsx global>{`
        @import url(
          'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
        );

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #0d0d0f;
          color: #fff;
          font-family: Inter, sans-serif;
        }

        button,
        input {
          font-family: inherit;
        }

        .app {
          min-height: 100vh;
          padding: 24px;
          background:
            radial-gradient(
              circle at top,
              #17171d,
              #0d0d0f 55%
            );
        }

        .header {
          max-width: 1400px;
          margin: auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 22px;
        }

        .header h1 {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
        }

        .header p {
          margin: 5px 0 0;
          color: #9ca3af;
          font-size: 10px;
          letter-spacing: 3px;
        }

        .real {
          color: #22c55e;
          font-size: 10px;
          font-weight: 800;
        }

        .real::before {
          content: "●";
          margin-right: 6px;
          text-shadow: 0 0 8px #22c55e;
        }

        .controls {
          max-width: 1400px;
          margin: auto;
          margin-bottom: 15px;
        }

        .target {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          background: #1a1a1f;
          border: 1px solid #2a2a30;
          border-radius: 10px;
          padding: 9px 12px;
          color: #9ca3af;
          font-size: 9px;
          font-weight: 800;
        }

        .target input {
          width: 40px;
          padding: 5px;
          border-radius: 6px;
          border: 1px solid #2a2a30;
          background: #0d0d0f;
          color: #fff;
          text-align: center;
          outline: none;
        }

        .tabs {
          max-width: 1400px;
          margin: auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 18px;
        }

        .tab {
          padding: 12px;
          border-radius: 11px;
          background: #1a1a1f;
          border: 1px solid #2a2a30;
          color: #9ca3af;
          cursor: pointer;
          font-size: 10px;
          font-weight: 800;
        }

        .tab.active {
          background: #2563eb;
          border-color: #2563eb;
          color: #fff;
          box-shadow:
            0 0 22px
            rgba(37,99,235,.22);
        }

        .cards {
          max-width: 1400px;
          margin: auto;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .card {
          background: #1a1a1f;
          border: 1px solid #2a2a30;
          border-radius: 18px