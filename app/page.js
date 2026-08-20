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

function getLastDigit(price) {
  const text = String(price);
  const digits = text.replace(/\D/g, "");

  if (!digits.length) return null;

  return Number(digits.at(-1));
}

function getPairAnalysis(
  digits,
  prices,
  pairId,
  target
) {
  if (digits.length < 30) {
    return {
      leftScore: 0,
      rightScore: 0,
      winner: "WAIT",
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

  /*
   * MATCHES / DIFFERS
   */
  if (pairId === "matches_differs") {
    const targetRate =
      frequency[target] / recent.length;

    leftScore =
      35 + targetRate * 180;

    rightScore =
      70 - targetRate * 100;

    if (targetRate >= 0.1) {
      patterns.push(
        `digit ${target} concentration`
      );
    } else {
      patterns.push(
        `digit ${target} scarcity`
      );
    }
  }

  /*
   * UNDER / OVER
   */
  if (pairId === "under_over") {
    const underCount =
      recent.filter(
        (digit) => digit < target
      ).length;

    const overCount =
      recent.filter(
        (digit) => digit >= target
      ).length;

    const underRate =
      underCount / recent.length;

    const overRate =
      overCount / recent.length;

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

  /*
   * EVEN / ODD
   */
  if (pairId === "even_odd") {
    const evenCount =
      recent.filter(
        (digit) => digit % 2 === 0
      ).length;

    const oddCount =
      recent.length - evenCount;

    const evenRate =
      evenCount / recent.length;

    const oddRate =
      oddCount / recent.length;

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

  /*
   * RISE / FALL
   */
  if (pairId === "rise_fall") {
    if (prices.length >= 10) {
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
        40 +
        (rises / 9) * 60;

      rightScore =
        40 +
        (falls / 9) * 60;

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
  }

  leftScore = Math.min(
    99,
    Math.round(leftScore)
  );

  rightScore = Math.min(
    99,
    Math.round(rightScore)
  );

  let winner = "WAIT";

  if (
    Math.max(leftScore, rightScore) >= 75
  ) {
    winner =
      leftScore >= rightScore
        ? PAIRS.find(
            (p) => p.id === pairId
          ).left
        : PAIRS.find(
            (p) => p.id === pairId
          ).right;
  }

  return {
    leftScore,
    rightScore,
    winner,
    pattern:
      patterns.length
        ? patterns.join(" + ")
        : "mixed conditions",
  };
}

function MiniChart({
  prices,
  color,
}) {
  if (!prices.length) {
    return (
      <div className="chartEmpty">
        Waiting for ticks...
      </div>
    );
  }

  const values =
    prices.slice(-25);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points =
    values
      .map((value, index) => {
        const x =
          (index /
            (values.length - 1 || 1)) *
          100;

        const y =
          100 -
          ((value - min) /
            range) *
            80 -
          10;

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

function MarketCard({
  market,
  data,
  onSwitch,
  pair,
  target,
}) {
  const price =
    data.prices.at(-1);

  const digit =
    data.digits.at(-1);

  const analysis =
    data.analysis;

  const winner =
    analysis.winner;

  const activeSignal =
    winner !== "WAIT";

  const winnerScore =
    winner === pair.left
      ? analysis.leftScore
      : winner === pair.right
      ? analysis.rightScore
      : 0;

  return (
    <div
      className={`marketCard ${
        activeSignal
          ? "activeCard"
          : ""
      }`}
    >
      <div className="cardTop">
        <div
          className="marketName"
          onClick={onSwitch}
        >
          <strong>
            {market.name}
          </strong>

          <span>
            {market.code}
          </span>
        </div>

        <div className="liveStatus">
          <span
            className={
              data.connected
                ? "liveDot"
                : "offlineDot"
            }
          />

          {data.connected
            ? "LIVE"
            : "OFFLINE"}
        </div>
      </div>

      <div className="chartArea">
        <MiniChart
          prices={data.prices}
          color={
            market.chartColor
          }
        />
      </div>

      <div className="price">
        {price !== undefined
          ? price
          : "—"}
      </div>

      <div className="digitCircle">
        {digit !== undefined
          ? digit
          : "—"}
      </div>

      <div className="predictionLabel">
        PREDICTION
      </div>

      <div className="pairPredictions">
        <div
          className={
            winner === pair.left
              ? "predictionSide winner"
              : "predictionSide"
          }
        >
          <span>
            {pair.left}
          </span>

          <strong>
            {analysis.leftScore}%
          </strong>
        </div>

        <div
          className={
            winner === pair.right
              ? "predictionSide winner"
              : "predictionSide"
          }
        >
          <span>
            {pair.right}
          </span>

          <strong>
            {analysis.rightScore}%
          </strong>
        </div>
      </div>

      <div className="mainPrediction">
        {winner === "WAIT"
          ? "WAIT"
          : winner === pair.left
          ? pair.left
          : pair.right}
      </div>

      <div className="pattern">
        {analysis.pattern}
      </div>

      <div className="confidence">
        <span>
          CONFIDENCE
        </span>

        <strong>
          {winnerScore}%
        </strong>
      </div>

      <div className="entryBox">
        {data.signalActive ? (
          <>
            <small>
              SIGNAL ACTIVE
            </small>

            <strong className="enterNow">
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
              ENTRY
            </small>

            <strong>
              WAITING
            </strong>
          </>
        )}
      </div>

      <button
        className="switchButton"
        onClick={onSwitch}
      >
        SWITCH MARKET
      </button>
    </div>
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

  const [marketData, setMarketData] =
    useState({});

  const [selector, setSelector] =
    useState(null);

  const sockets =
    useRef({});

  const pair =
    PAIRS.find(
      (item) =>
        item.id === activePair
    );

  function calculate(
    digits,
    prices
  ) {
    return getPairAnalysis(
      digits,
      prices,
      activePair,
      Number(target)
    );
  }

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
      ws = new WebSocket(
        WS_URL
      );

      sockets.current[
        symbol
      ] = ws;
    } catch {
      return;
    }

    ws.onopen = () => {
      setMarketData(
        (prev) => ({
          ...prev,
          [symbol]: {
            ...(