import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const GAME_API =
  "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageNo=1&pageSize=10";

let memory = {
  currentIssue: null,
  prediction: null,
  confidence: 0,
  locked: false,

  wins: 0,
  losses: 0,
  lossStreak: 0,
  hardStop: false,

  evaluatedIssue: null,
  latestResults: []
};

function colorOf(n) {
  n = Number(n);
  if (n === 0) return ["red", "violet"];
  if (n === 5) return ["green", "violet"];
  return n % 2 === 0 ? ["red"] : ["green"];
}

async function tick() {
  const res = await fetch(GAME_API);
  const json = await res.json();
  const list = json.data.list;

  const completedIssue = list[0].issueNumber;
  const resultColors = colorOf(list[0].number);

  // Evaluate result ONCE
  if (
    memory.locked &&
    memory.evaluatedIssue !== completedIssue
  ) {
    if (resultColors.includes(memory.prediction)) {
      memory.wins++;
      memory.lossStreak = 0;
    } else {
      memory.losses++;
      memory.lossStreak++;
    }
    memory.evaluatedIssue = completedIssue;
    memory.locked = false;
  }

  // Hard stop
  if (memory.lossStreak >= 3) {
    memory.hardStop = true;
  }

  // New prediction
  if (!memory.locked && !memory.hardStop) {
    const last6 = list.slice(0, 6);
    let g = 0, r = 0, v = 0;

    last6.forEach(i => {
      const c = colorOf(i.number);
      if (c.includes("green")) g++;
      if (c.includes("red")) r++;
      if (c.includes("violet")) v++;
    });

    if (v < 2) {
      memory.prediction = g >= r ? "green" : "red";
      memory.confidence = Math.round((Math.max(g, r) / 6) * 100);
      memory.currentIssue = completedIssue;
      memory.locked = true;
    }
  }

  memory.latestResults = list.slice(1, 6).map(i => ({
    issue: i.issueNumber,
    colors: colorOf(i.number)
  }));
}

app.get("/state", (req, res) => {
  const total = memory.wins + memory.losses;
  res.json({
    status: "LIVE",
    currentIssue: memory.currentIssue,
    prediction: memory.prediction,
    confidence: memory.confidence,
    locked: memory.locked,
    hardStop: memory.hardStop,
    wins: memory.wins,
    losses: memory.losses,
    accuracy: total ? Math.round((memory.wins / total) * 100) : 0,
    latestResults: memory.latestResults
  });
});

app.get("/reset/stats", (req, res) => {
  memory.wins = 0;
  memory.losses = 0;
  memory.lossStreak = 0;
  res.json({ ok: true });
});

app.get("/reset/hardstop", (req, res) => {
  memory.lossStreak = 0;
  memory.hardStop = false;
  res.json({ ok: true });
});

setInterval(tick, 60000);
tick();

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
