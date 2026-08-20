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
    const recentPrices = prices.slice(-8);

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
      patterns.push("upward pressure");
    }

    if (
      contract === "fall" &&
      falls >= 5
    ) {
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

export default function Home() {
  const socketRef = useRef(null);
  const reconnectRef = useRef(null);
  const mountedRef = useRef(true);

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
      setStatus(
        "WebSocket creation failed"
      );

      setError(String(err));

      return;
    }

    ws.onopen = () => {
      if (!mountedRef.current) return;

      console.log(
        "Connected to Deriv public WebSocket"
      );

      setConnected(true);
      setStatus("Connected");
      setError("");

      /*
       * Request available symbols.
       *
       * IMPORTANT:
       * product_type has intentionally
       * been removed.
       */

      ws.send(
        JSON.stringify({
          active_symbols: "brief",
          req_id: 1,
        })
      );

      /*
       * Request historical ticks.
       */

      ws.send(
        JSON.stringify({
          ticks_history: symbol,
          count: 200,
          end: "latest",
          style: "ticks",
          req_id: 2,
        })
      );

      /*
       * Subscribe to live ticks.
       */

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
        const data =
          JSON.parse(event.data);

        console.log(
          "DERIV MESSAGE:",
          data
        );

        setServerMessage(
          data.msg_type ||
            "message received"
        );

        /*
         * Deriv API error
         */

        if (data.error) {
          setError(
            data.error.message ||
              "Deriv API error"
          );

          setStatus("Deriv API error");

          return;
        }

        /*
         * Active symbols
         */

        if (
          data.msg_type ===
          "active_symbols"
        ) {
          const exists =
            data.active_symbols?.some(
              (item) =>
                item.symbol === symbol
            );

          if (!exists) {
            setError(
              `${symbol} was not returned by Deriv active_symbols`
            );
          }
        }

        /*
         * Historical ticks
         */

        if (
          data.msg_type === "history" &&
          data.history?.prices
        ) {
          const historical =
            data.history.prices.map(
              Number
            );

          const historicalDigits =
            historical
              .map(getLastDigit)
              .filter(
                (digit) =>
                  digit !== null
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
         * Live tick
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
            (previous) =>
              previous + 1
          );

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

    ws.onerror = (event) => {
      console.error(
        "DERIV WEBSOCKET ERROR:",
        event
      );

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
      console.log(
        "Deriv socket closed:",
        event.code,
        event.reason
      );

      if (!mountedRef.current) return;

      setConnected(false);

      setStatus(
        `Disconnected (${event.code})`
      );

      /*
       * Reconnect after 5 seconds.
       */

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

  const analysis = useMemo(
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
        ([id]) => id === contract
      )?.[1];

    const signal = {
      id:
        `${tickCount}-${contract}-${analysis.score}`,
      time:
        new Date().toLocaleTimeString(),
      type: label,
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
    digits.length,
  ]);

  const price =
    prices.at(-1);

  const lastDigit =
    digits.at(-1);

  const strength =
    analysis.score >= 80
      ? "STRONG"
      : analysis.score >= 75
      ? "VALID"
      : analysis.score >= 60
      ? "WATCH"
      : "WAIT";

  return (
    <main className="app">

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
          ● {status}
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
              setSymbol(e.target.value)
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
              setTarget(e.target.value)
            }
          />

        </label>

        <button
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

      <section className="dashboard">

        <div className="card">

          <p>
            LIVE PRICE
          </p>

          <div className="price">
            {price ?? "—"}
          </div>

          <p>
            LAST DIG