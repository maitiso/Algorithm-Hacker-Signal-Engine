"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const WS_URL =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const MARKETS = [
  {
    name: "Volatility 50",
    code: "R_50",
    chartColor: "#22C55E",
  },
  {
    name: "Volatility 50 (1s)",
    code: "1HZ50V",
    chartColor: "#22C55E",
  },
  {
    name: "Volatility 75",
    code: "R_75",
    chartColor: "#EF4444",
  },
  {
    name: "Volatility 100",
    code: "R_100",
    chartColor: "#22C55E",
  },
  {
    name: "Volatility 75 (1s)",
    code: "1HZ75V",
    chartColor: "#EF4444",
  },
  {
    name: "Volatility 100 (1s)",
    code: "1HZ100V",
    chartColor: "#22C55E",
  },
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

function getPredictionText(
  contract,
  target
) {
  switch (contract) {
    case "matches":
      return `MATCHES ${target}`;

    case "differs":
      return `DIFFERS ${target}`;

    case "under":
      return "UNDER 5";

    case "over":
      return "OVER 4";

    case "even":
      return "EVEN";

    case "odd":
      return "ODD";

    case "rise":
      return "RISE";

    case "fall":
      return "FALL";

    default:
      return "WAITING";
  }
}

function getPredictionSubtext(
  contract,
  target
) {
  switch (contract) {
    case "matches":
      return `Last digit = ${target}`;

    case "differs":
      return `Last digit ≠ ${target}`;

    case "under":
      return "Last digit < 5 • wins on 0–4";

    case "over":
      return "Last digit > 4 • wins on 5–9";

    case "even":
      return "Last digit is even • 0,2,4,6,8";

    case "odd":
      return "Last digit is odd • 1,3,5,7,9";

    case "rise":
      return "Next price expected to rise";

    case "fall":
      return "Next price expected to fall";

    default:
      return "Waiting for analysis";
  }
}

function getPredictionBadge(
  contract,
  target
) {
  switch (contract) {
    case "under":
      return "U5";

    case "over":
      return "O4";

    case "matches":
      return `M${target}`;

    case "differs":
      return `D${target}`;

    case "even":
      return "EV";

    case "odd":
      return "OD";

    case "rise":
      return "RI";

    case "fall":
      return "FA";

    default:
      return "--";
  }
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

  /*
   * Entry countdown.
   *
   * This is a real UI countdown.
   * It does NOT randomly jump from 4
   * to 1 every second.
   */
  const [entryCountdown, setEntryCountdown] =
    useState(3);

  /*
   * Which prediction button is selected
   */
  const [activePair, setActivePair] =
    useState("underOver");

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
      setError("");

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

        if (
          data.msg_type === "active_symbols"
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

          /*
           * Each new real tick starts
           * a fresh entry countdown.
           */
          setEntryCountdown(3);

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
   * Connect when market changes
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
   * Entry countdown.
   *
   * It counts:
   *
   * 3 → 2 → 1 → ENTER NOW
   *
   * It does NOT randomly change.
  