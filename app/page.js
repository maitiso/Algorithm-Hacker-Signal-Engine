"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const CONTRACTS = [
  ["matches", "MATCHES"],
  ["differs", "DIFFERS"],
  ["under", "UNDER"],
  ["over", "OVER"],
  ["even", "EVEN"],
  ["odd", "ODD"],
  ["rise", "RISE"],
  ["fall", "FALL"]
];

const SYMBOLS = [
  "R_50",
  "R_75",
  "R_100",
  "1HZ50V",
  "1HZ75V",
  "1HZ100V"
];

function getLastDigit(price) {
  const text = String(price);
  const digits = text.replace(/\D/g, "");
  return Number(digits[digits.length - 1]);
}

function analyseDigits(digits) {
  if (!digits.length) {
    return {
      frequency: Array(10).fill(0),
      evenRate: 0,
      highRate: 0
    };
  }

  const frequency = Array(10).fill(0);

  digits.forEach((digit) => {
    frequency[digit]++;
  });

  const evenRate =
    digits.filter((digit) => digit % 2 === 0).length /
    digits.length;

  const highRate =
    digits.filter((digit) => digit >= 5).length /
    digits.length;

  return {
    frequency,
    evenRate,
    highRate
  };
}

function calculateScore({
  type,
  digits,
  prices,
  barrier,
  target
}) {
  if (digits.length < 30) {
    return {
      score: 0,
      pattern: "Collecting tick data"
    };
  }

  const recent = digits.slice(-30);
  const stats = analyseDigits(digits);
  const recentStats = analyseDigits(recent);

  let score = 50;
  const patterns = [];

  if (
    recent.length >= 2 &&
    recent[recent.length - 1] ===
      recent[recent.length - 2]
  ) {
    score += 8;
    patterns.push("repetition");
  }

  const maxFrequency =
    Math.max(...recentStats.frequency);

  if (maxFrequency >= 5) {
    score += 7;
    patterns.push("digit cluster");
  }

  if (type === "even" && recentStats.evenRate > 0.55) {
    score += 12;
    patterns.push("even bias");
  }

  if (
    type === "odd" &&
    recentStats.evenRate < 0.45
  ) {
    score += 12;
    patterns.push("odd bias");
  }

  if (type === "over" && recentStats.highRate > 0.55) {
    score += 12;
    patterns.push("high digit bias");
  }

  if (type === "under" && recentStats.highRate < 0.45) {
    score += 12;
    patterns.push("low digit bias");
  }

  if (type === "matches") {
    const probability =
      stats.frequency[target] /
      digits.length;

    if (probability > 0.1) {
      score += 15;
      patterns.push(
        `digit ${target} concentration`
      );
    }
  }

  if (type === "differs") {
    const probability =
      stats.frequency[target] /
      digits.length;

    if (probability < 0.1) {
      score += 12;
      patterns.push(
        `digit ${target} scarcity`
      );
    }
  }

  if (
    (type === "rise" || type === "fall") &&
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

    if (type === "rise" && rises >= 5) {
      score += 18;
      patterns.push("upward pressure");
    }

    if (type === "fall" && falls >= 5) {
      score += 18;
      patterns.push("downward pressure");
    }
  }

  score = Math.min(99, Math.max(0, score));

  return {
    score,
    pattern:
      patterns.length
        ? patterns.slice(0, 3).join(" + ")
        : "mixed conditions"
  };
}

export default function Home() {
  const socket = useRef(null);

  const [symbol, setSymbol] = useState("R_50");
  const [contract, setContract] =
    useState("over");

  const [prices, setPrices] = useState([]);
  const [digits, setDigits] = useState([]);

  const [connected, setConnected] =
    useState(false);

  const [status, setStatus] =
    useState("Disconnected");

  const [barrier, setBarrier] =
    useState(5);

  const [target, setTarget] =
    useState(7);

  const [tickNumber, setTickNumber] =
    useState(0);

  const [history, setHistory] =
    useState([]);

  const connect = () => {
    if (socket.current) {
      socket.current.close();
    }

    setStatus("Connecting...");

    const ws = new WebSocket(
      "wss://ws.binaryws.com/websockets/v3"
    );

    socket.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setStatus("Connected");

      ws.send(
        JSON.stringify({
          ticks_history: symbol,
          adjust_start_time: 1,
          count: 200,
          end: "latest",
          start: 1,
          style: "ticks"
        })
      );

      ws.send(
        JSON.stringify({
          ticks: symbol,
          subscribe: 1
        })
      );
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (
        data.msg_type === "history" &&
        data.history?.prices
      ) {
        const historical =
          data.history.prices.map(Number);

        setPrices(historical.slice(-300));

        setDigits(
          historical
            .slice(-300)
            .map(getLastDigit)
        );
      }

      if (
        data.msg_type === "tick" &&
        data.tick
      ) {
        const price =
          Number(data.tick.quote);

        const digit =
          getLastDigit(price);

        setPrices((previous) => [
          ...previous.slice(-299),
          price
        ]);

        setDigits((previous) => [
          ...previous.slice(-299),
          digit
        ]);

        setTickNumber(
          (previous) => previous + 1
        );
      }

      if (data.error) {
        setStatus(
          data.error.message ||
            "Deriv error"
        );
      }
    };

    ws.onerror = () => {
      setConnected(false);
      setStatus("Connection error");
    };

    ws.onclose = () => {
      setConnected(false);
      setStatus("Disconnected");
    };
  };

  useEffect(() => {
    connect();

    return () => {
      socket.current?.close();
    };
  }, [symbol]);

  const analysis = useMemo(
    () =>
      calculateScore({
        type: contract,
        digits,
        prices,
        barrier,
        target
      }),
    [
      contract,
      digits,
      prices,
      barrier,
      target
    ]
  );

  useEffect(() => {
    if (
      analysis.score >= 75 &&
      digits.length >= 30 &&
      tickNumber > 0
    ) {
      const label =
        CONTRACTS.find(
          ([id]) => id === contract
        )?.[1];

      const signal = {
        id: `${tickNumber}-${contract}`,
        time:
          new Date().toLocaleTimeString(),
        type: label,
        score: analysis.score,
        pattern: analysis.pattern
      };

      setHistory((previous) => {
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
          ...previous
        ].slice(0, 20);
      });
    }
  }, [
    tickNumber,
    analysis.score,
    analysis.pattern,
    contract,
    digits.length
  ]);

  const price =
    prices[prices.length - 1];

  const digit =
    digits[digits.length - 1];

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

      <section className="controls">

        <label>
          MARKET

          <select
            value={symbol}
            onChange={(e) =>
              setSymbol(e.target.value)
            }
          >
            {SYMBOLS.map((item) => (
              <option key={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label>
          BARRIER

          <input
            type="number"
            min="0"
            max="9"
            value={barrier}
            onChange={(e) =>
              setBarrier(e.target.value)
            }
          />
        </label>

        <label>
          TARGET

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

        <button onClick={connect}>
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

          <p>LIVE PRICE</p>

          <div className="price">
            {price ?? "—"}
          </div>

          <p>LAST DIGIT</p>

          <div className="lastDigit">
            {digit ?? "—"}
          </div>

          <p>TICKS ANALYZED</p>

          <div className="tickCount">
            {digits.length}
          </div>

        </div>

        <div className="card">

          <p>RECENT DIGITS</p>

          <div className="digits">

            {digits
              .slice(-40)
              .map((item, index) => (
                <span key={index}>
                  {item}
                </span>
              ))}

          </div>

          <p className="patternTitle">
            PATTERN
          </p>

          <strong>
            {analysis.pattern}
          </strong>

        </div>

        <div className="card">

          <p>MODEL SCORE</p>

          <div className="confidence">
            {analysis.score}%
          </div>

          <div className="meter">

            <div
              style={{
                width:
                  `${analysis.score}%`
              }}
            />

          </div>

          <div className="strength">
            {strength}
          </div>

          <div className="signal">

            <p>SIGNAL</p>

            <strong>
              {
                CONTRACTS.find(
                  ([id]) =>
                    id === contract
                )?.[1]
              }
            </strong>

            <span>
              ENTRY: NEXT TICK
            </span>

          </div>

        </div>

      </section>

      <section className="card history">

        <h2>
          SIGNAL HISTORY
        </h2>

        {history.length === 0 ? (

          <div className="empty">
            Waiting for a valid signal...
          </div>

        ) : (

          history.map((signal) => (

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

          ))

        )}

      </section>

      <footer>
        SIGNAL-ONLY MODE • REAL DERIV DATA •
        NO TRADE EXECUTION
      </footer>

    </main>
  );
}