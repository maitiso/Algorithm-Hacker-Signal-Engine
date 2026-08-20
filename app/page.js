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

/*
 * FOUR PAIRS
 *
 * Each pair is a separate prediction family.
 */

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
    recent.filter(
      (d) => d % 2 === 0
    ).length / recent.length;

  const highRate =
    recent.filter(
      (d) => d >= 5
    ).length / recent.length;

  const frequency = Array(10).fill(0);

  recent.forEach((digit) => {
    frequency[digit]++;
  });

  /*
   * Repetition
   */

  if (
    recent.length >= 2 &&
    recent.at(-1) === recent.at(-2)
  ) {
    score += 8;
    patterns.push("repetition");
  }

  /*
   * Digit cluster
   */

  if (Math.max(...frequency) >= 5) {
    score += 7;
    patterns.push("digit cluster");
  }

  /*
   * EVEN
   */

  if (
    contract === "even" &&
    evenRate > 0.55
  ) {
    score += 12;
    patterns.push("even bias");
  }

  /*
   * ODD
   */

  if (
    contract === "odd" &&
    evenRate < 0.45
  ) {
    score += 12;
    patterns.push("odd bias");
  }

  /*
   * OVER
   */

  if (
    contract === "over" &&
    highRate > 0.55
  ) {
    score += 12;
    patterns.push("over bias");
  }

  /*
   * UNDER
   */

  if (
    contract === "under" &&
    highRate < 0.45
  ) {
    score += 12;
    patterns.push("under bias");
  }

  /*
   * MATCHES
   */

  if (contract === "matches") {
    const rate =
      frequency[target] /
      recent.length;

    if (rate > 0.1) {
      score += 15;

      patterns.push(
        `digit ${target} concentration`
      );
    }
  }

  /*
   * DIFFERS
   */

  if (contract === "differs") {
    const rate =
      frequency[target] /
      recent.length;

    if (rate < 0.1) {
      score += 12;

      patterns.push(
        `digit ${target} scarcity`
      );
    }
  }

  /*
   * RISE / FALL
   */

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
      patterns.length
        ? patterns
            .slice(0, 3)
            .join(" + ")
        : "mixed conditions",
  };
}

function getPairForContract(contract) {
  return PAIRS.find((pair) =>
    pair.options.some(
      ([id]) => id === contract
    )
  );
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

    case "