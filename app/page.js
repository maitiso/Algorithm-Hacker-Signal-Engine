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
  const value = String(price);
  const digits = value.replace(/\D/g, "");

  if (!digits.length) return null;

  return Number(digits[digits.length - 1]);
}

function analyse(digits, prices, type, target) {
  if (digits.length < 30) {
    return {
      score: 0,
      pattern: "Collecting tick data",
    };
  }

  const recent = digits.slice(-30);

  let score = 50;
  const patterns = [];

  const even =
    recent.filter((d) => d % 2 === 0).length /
    recent.length;

  const over =
    recent.filter((d) => d >= 5).length /
    recent.length;

  const frequency = Array(10).fill(0);

  recent.forEach((d) => {
    frequency[d]++;
  });

  const highestFrequency =
    Math.max(...frequency);

  if (
    recent.length >= 2 &&
    recent.at(-1) === recent.at(-2)
  ) {
    score += 8;
    patterns.push("repetition");
  }

  if (highestFrequency >= 5) {
    score += 7;
    patterns.push("digit cluster");
  }

  if (type === "even" && even > 0.55) {
    score += 12;
    patterns.push("even bias");
  }

  if (type === "odd" && even < 0.45) {
    score += 12;
    patterns.push("odd bias");
  }

  if (type === "over" && over > 0.55) {
    score += 12;
    patterns.push("over bias");
  }

  if (type === "under" && over < 0.45) {
    score += 12;
    patterns.push("under bias");
  }

  if (type === "matches") {
    const rate =
      frequency[target] / recent.length;

    if (rate > 0.1) {
      score += 15;
      patterns.push(`digit ${target} concentration`);
    }
  }

  if (type === "differs") {
    const rate =
      frequency[target] / recent.length;

    if (rate < 0.1) {
      score += 12;
      patterns.push(`digit ${target} scarcity`);
    }
  }

  if (
    (type === "rise" || type === "fall") &&
    prices.length >= 8
  ) {
    const p = prices.slice(-8);

    let rises = 0;
    let falls = 0;

    for (let i = 1; i < p.length; i++) {
      if (p[i] > p[i - 1]) rises++;
      if (p[i] < p[i - 1]) falls++;
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
        : "mixed conditions",
  };
}

export default function Home() {
  const socketRef = useRef(null);
  const reconnectTimer = useRef(null);

  const [symbol, setSymbol] = useState("R_50");
  const [contract, setContract] = useState("over");

  const [prices, setPrices] = useState([]);
  const [digits, setDigits] = useState([]);

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Connecting...");
  const [error, setError] = useState("");

  const [target, setTarget] = useState(7);

  const [tickCount, setTickCount] = useState(0);

  const [signals, setSignals] = useState([]);

  const connect = () => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
    }

    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch {}
    }

    setStatus("Connecting...");
    setError("");

    const ws = new WebSocket(
      "wss://ws.binaryws.com/websockets/v3"
    );

    socketRef.current = ws;

    ws.onopen = () => {
      console.log("Deriv WebSocket connected");

      setConnected(true);
      setStatus("Connected");
      setError("");

      /*
       * Load historical ticks first
       */

      ws.send(
        JSON.stringify({
          ticks_history: symbol,
          adjust_start_time: 1,
          count: 200,
          end: "latest",
          start: 1,
          style: "ticks",
        })
      );

      /*
       * Then subscribe to live ticks
       */

      ws.send(
        JSON.stringify({
          ticks: symbol,
          subscribe: 1,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        console.log("DERIV:", data);

        /*
         * API error
         */

        if (data.error) {
          setError(
            data.error.message ||
              "Deriv API error"
          );

          return;
        }

        /*
         * Historical data
         */

        if (
          data.msg_type === "history" &&
          data.history &&
          data.history.prices
        ) {
          const historicalPrices =
            data.history.prices.map(Number);

          const historicalDigits =
            historicalPrices
              .map(getLastDigit)
              .filter(
                (digit) => digit !== null
              );

          setPrices(
            historicalPrices.slice(-300)
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
          const price =
            Number(data.tick.quote);

          const digit =
            getLastDigit(price);

          if (digit === null) return;

          setPrices((previous) => [
            ...previous.slice(-299),
            price,
          ]);

          setDigits((previous) => [
            ...previous.slice(-299),
            digit,
          ]);

          setTickCount(
            (previous) => previous + 1
          );

          setStatus(
            "LIVE • Receiving ticks"
          );

          setError("");
        }
      } catch (err) {
        console.error(
          "Message parsing error:",
          err
        );

        setError(
          "Unable to read Deriv response"
        );
      }
    };

    ws.onerror = () => {
      console.error(
        "Deriv WebSocket error"
      );

      setConnected(false);
      setStatus("Connection error");
      setError(
        "WebSocket connection failed"
      );
    };

    ws.onclose = () => {
      setConnected(false);
      setStatus("Disconnected");

      /*
       * Automatically reconnect
       */

      reconnectTimer.current =
        setTimeout(() => {
          connect();
        }, 5000);
    };
  };

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimer.current) {
        clearTimeout(
          reconnectTimer.current
        );
      }

      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [symbol]);

  const analysis = useMemo(() => {
    return analyse(
      digits,
      prices,
      contract,
      Number(target)
    );
  }, [
    digits,
    prices,
    contract,
    target,
  ]);

  useEffect(() => {
    if (
     