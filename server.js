import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const GAME_API =
  "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageNo=1&pageSize=10";

/* ================= MEMORY ================= */
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
  latestResults: [],

  // hidden tuning
  bias: { green: 1, red: 1 }
};

/* ================= HELPERS ================= */
function colorOf(n) {
  n = Number(n);
  if (n === 0) return ["red", "violet"];
  if (n === 5) return ["green", "violet"];
  return n % 2 === 0 ? ["red"] : ["green"];
}

/* ================= CORE ENGINE ================= */
async function tick() {
  const res = await fetch(GAME_API);
  const json = await res.json();
  const list = json.data.list;

  const issue = list[0].issueNumber;
  const resultColors = colorOf(list[0].number);

  /* ===== RESULT EVALUATION (ONCE) ===== */
  if (
    memory.locked &&
    memory.evaluatedIssue !== issue &&
    memory.currentIssue !== issue
  ) {
    if (resultColors.includes(memory.prediction)) {
      memory.wins++;
      memory.lossStreak = 0;
      memory.bias[memory.prediction] *= 1.02;
    } else {
      memory.losses++;
      memory.lossStreak++;
      memory.bias[memory.prediction] *= 0.97;
    }

    memory.evaluatedIssue = issue;
    memory.locked = false;
    memory.prediction = null;
  }

  /* ===== HARD STOP ===== */
  if (memory.lossStreak >= 3) {
    memory.hardStop = true;
  }

  /* ===== NEW ROUND ===== */
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
      const gw = g * memory.bias.green;
      const rw = r * memory.bias.red;

      memory.prediction = gw >= rw ? "green" : "red";
      memory.confidence = Math.min(
        95,
        Math.round((Math.max(gw, rw) / 6) * 100)
      );

      memory.currentIssue = issue;
      memory.locked = true;
    }
  }

  /* ===== LATEST RESULTS (COMPLETED ONLY) ===== */
  memory.latestResults = list.slice(1, 6).map(i => ({
    issue: i.issueNumber,
    colors: colorOf(i.number)
  }));
}

/* ================= API ================= */
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

/* ================= CONTROLS ================= */
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

/* ================= START ================= */
setInterval(tick, 60000);
tick();

app.listen(3000, () =>
  console.log("SERVER MODE running on port 3000")
);
