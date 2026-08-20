"use client";

import { useEffect, useRef, useState } from "react";

const WS_URL =
  "wss://api.derivws.com/trading/v1/options/ws/public";

/* =========================================================
   REAL DERIV MARKETS
========================================================= */

const markets = [
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
    name: "Volatility 75 (1s)",
    code: "1HZ75V",
    chartColor: "#EF4444",
  },
  {
    name: "Volatility 100",
    code: "R_100",
    chartColor: "#22C55E",
  },
  {
    name: "Volatility 100 (1s)",
    code: "1HZ100V",
    chartColor: "#22C55E",
  },
];

/* =========================================================
   PAIRED CONTRACT TABS
========================================================= */

const tabs = [
  {
    id: "matches_differs",
    left: "MATCHES",
    right: "DIFFERS",
  },
  {
    id: "under_over",
    left: "UNDER",
    right: "OVER",
  },
  {
    id: "even_odd",
    left: "EVEN",
    right: "ODD",
  },
  {
    id: "rise_fall",
    left: "RISE",
    right: "FALL",
  },
];

/* =========================================================
   GET LAST DIGIT
========================================================= */

function getLastDigit(price) {
  const text = String(price);
  const digits = text.replace(/\D/g, "");

  if (!digits.length) return null;

  return Number(digits.at(-1));
}

/* =========================================================
   ANALYSIS ENGINE
========================================================= */

function calculateAnalysis(
  digits,
  prices,
  activeTab,
  target
) {
  if (digits.length < 30) {
    return {
      leftScore: 0,
      rightScore: 0,
      prediction: "WAIT",
      pattern: "Collecting tick data",
    };
  }

  const recent = digits.slice(-30);

  const frequency = Array(10).fill(0);

  recent.forEach((digit) => {
    frequency[digit]++;
  });

  let leftScore = 50;
  let rightScore = 50;

  const patterns = [];

  /* ================= MATCHES / DIFFERS ================= */

  if (activeTab === "matches_differs") {
    const matchRate =
      frequency[target] / recent.length;

    leftScore =
      35 + matchRate * 250;

    rightScore =
      70 - matchRate * 80;

    if (matchRate >= 0.1) {
      patterns.push(
        `digit ${target} concentration`
      );
    } else {
      patterns.push(
        `digit ${target} scarcity`
      );
    }
  }

  /* ================= UNDER / OVER ================= */

  if (activeTab === "under_over") {
    const underRate =
      recent.filter(
        (digit) => digit < target
      ).length / recent.length;

    const overRate =
      recent.filter(
        (digit) => digit >= target
      ).length / recent.length;

    leftScore =
      40 + underRate * 60;

    rightScore =
      40 + overRate * 60;

    if (underRate > overRate) {
      patterns.push("under bias");
    } else {
      patterns.push("over bias");
    }
  }

  /* ================= EVEN / ODD ================= */

  if (activeTab === "even_odd") {
    const evenRate =
      recent.filter(
        (digit) => digit % 2 === 0
      ).length / recent.length;

    const oddRate = 1 - evenRate;

    leftScore =
      40 + evenRate * 60;

    rightScore =
      40 + oddRate * 60;

    if (evenRate > oddRate) {
      patterns.push("even bias");
    } else {
      patterns.push("odd bias");
    }
  }

  /* ================= RISE / FALL ================= */

  if (activeTab === "rise_fall") {
    const recentPrices =
      prices.slice(-10);

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

    leftScore =
      40 + (rises / 9) * 60;

    rightScore =
      40 + (falls / 9) * 60;

    if (rises > falls) {
      patterns.push(
        "upward pressure"
      );
    } else if (falls > rises) {
      patterns.push(
        "downward pressure"
      );
    } else {
      patterns.push(
        "balanced movement"
      );
    }
  }

  /* ================= GENERAL PATTERNS ================= */

  if (
    recent.length >= 2 &&
    recent.at(-1) ===
      recent.at(-2)
  ) {
    patterns.push("repetition");
  }

  if (
    Math.max(...frequency) >= 5
  ) {
    patterns.push("digit cluster");
  }

  leftScore = Math.min(
    99,
    Math.max(1, Math.round(leftScore))
  );

  rightScore = Math.min(
    99,
    Math.max(1, Math.round(rightScore))
  );

  let prediction = "WAIT";

  if (
    leftScore >= 75 ||
    rightScore >= 75
  ) {
    prediction =
      leftScore >= rightScore
        ? "LEFT"
        : "RIGHT";
  }

  return {
    leftScore,
    rightScore,
    prediction,
    pattern:
      patterns.length
        ? patterns
            .slice(0, 3)
            .join(" + ")
        : "mixed conditions",
  };
}

/* =========================================================
   LIVE MINI CHART
========================================================= */

function MiniChart({
  prices,
  color,
}) {
  if (!prices.length) {
    return (
      <div className="chartWaiting">
        Waiting for ticks...
      </div>
    );
  }

  const values =
    prices.slice(-25);

  const min =
    Math.min(...values);

  const max =
    Math.max(...values);

  const range =
    max - min || 1;

  const points =
    values
      .map((value, index) => {
        const x =
          (index /
            Math.max(
              values.length - 1,
              1
            )) *
          100;

        const y =
          90 -
          ((value - min) /
            range) *
            75;

        return `${x},${y}`;
      })
      .join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="miniChart"
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

/* =========================================================
   MAIN DASHBOARD
========================================================= */

export default function Dashboard() {
  const [activeTab, setActiveTab] =
    useState(
      "under_over"
    );

  const [target, setTarget] =
    useState(5);

  const [cards, setCards] =
    useState(
      markets.slice(0, 3).map(
        (market) => ({
          ...market,
          prices: [],
          digits: [],
          connected: false,

          confidence: 0,

          state: "waiting",

          countdown: 0,

          number: null,

          prediction: "WAIT",

          pattern:
            "Collecting tick data",

          leftScore: 0,

          rightScore: 0,

          signalId: null,
        })
      )
    );

  const [marketSelector, setMarketSelector] =
    useState(null);

  const sockets =
    useRef({});

  const countdownLocks =
    useRef({});

  /* =======================================================
     CONNECT MARKET TO DERIV
  ======================================================= */

  function connectMarket(
    market
  ) {
    const symbol =
      market.code;

    if (
      sockets.current[symbol]
    ) {
      try {
        sockets.current[
          symbol
        ].close();
      } catch {}
    }

    let ws;

    try {
      ws =
        new WebSocket(
          WS_URL
        );
    } catch {
      return;
    }

    sockets.current[
      symbol
    ] = ws;

    ws.onopen = () => {
      setCards((prev) =>
        prev.map((card) =>
          card.code === symbol
            ? {
                ...card,
                connected: true,
              }
            : card
        )
      );

      /* Historical ticks */

      ws.send(
        JSON.stringify({
          ticks_history:
            symbol,
          count: 200,
          end: "latest",
          style: "ticks",
          req_id: 1,
        })
      );

      /* Live ticks */

      ws.send(
        JSON.stringify({
          ticks: symbol,
          subscribe: 1,
          req_id: 2,
        })
      );
    };

    ws.onmessage = (
      event
    ) => {
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
            message.error
              .message
          );

          return;
        }

        /* ================= HISTORY ================= */

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
              .map(
                getLastDigit
              )
              .filter(
                (digit) =>
                  digit !== null
              );

          updateCardData(
            symbol,
            prices,
            digits
          );
        }

        /* ================= LIVE TICK ================= */

        if (
          message.msg_type ===
          "tick"
        ) {
          const quote =
            Number(
              message.tick
                ?.quote
            );

          if (
            !Number.isFinite(
              quote
            )
          ) {
            return;
          }

          setCards(
            (previous) => {
              return previous.map(
                (card) => {
                  if (
                    card.code !==
                    symbol
                  ) {
                    return card;