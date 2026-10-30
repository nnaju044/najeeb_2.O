# Jeebs 2.O — 90-Day Life Challenge

> **Tagline:** Build a better you.

Jeebs 2.O is a personal performance tracking and life transformation web application. It accounts for every one of the 1,440 minutes in a day, balances health metrics (water, nutrition, sleep, weight), logs workouts, tracks daily habits, and monitors deep work across a 90-day challenge split into 13 achievement periods.

---

## Features

- **24-Hour Time Accounting:** Track all 24 hours (00:00 to 23:00) with a 60-minute cap per hour. Categories include Productive, Unproductive, Rest, and Sleep. Missing minutes remain explicitly unclassified.
- **Hydration (Water):** One-tap quick logging (250 ml, 500 ml, 1 L), custom amounts, daily goal tracking, undo capability, and 7-day intake trends.
- **Nutrition & Meals:** Reference food database, custom food builder, meal logs (Breakfast, Lunch, Dinner, Snacks), favorite meal presets with 1-tap logging, and macro tracking (protein, calories, carbs, fat).
- **Sleep Tracking:** Bedtime and wake-up pickers with automatic midnight crossover calculations (e.g. 23:30 to 07:00 = 7.5 hours), sleep quality ratings, and 14-night historical trends.
- **Body Weight & Composition:** Track weight, 7-day moving average, BMI calculation, waist measurements, and historical trend graphs.
- **Gym & Strength:** Workout sessions, exercise library, set-by-set reps/weights, volume progression charts, and workout consistency tracking.
- **Habits & Discipline:** 9 starter habits auto-seeded on challenge start, 1-tap daily toggles (`done`, `skipped`, `na`, `clear`), and streak calculation.
- **Focused Work:** Track coding, learning, and content creation sessions. Minutes flow directly into the 24-hour tracker without double counting.
- **13-Week Challenge System:** 90 days partitioned into 13 milestone weeks (Week 13 covers Days 85–90). Reports are generated from actual stored records upon week completion.
- **Offline PWA Support:** Service worker shell caching, web app manifest, and offline write queue that automatically syncs when reconnected.
- **Data Sovereignty:** Full data export in JSON and CSV formats at any time.

---

## Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** MongoDB & Mongoose (with local on-disk WiredTiger persistence fallback)
- **Frontend / Templating:** EJS, Vanilla JavaScript, Vanilla CSS, Lucide Icons, Chart.js
- **Security:** Helmet, express-rate-limit, express-session (MongoStore), bcryptjs, CSRF protection, request sanitization
- **Testing:** Node.js native test runner (`node:test`), supertest

---

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0

### Local Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```
   *For local development, leaving `MONGODB_URI` unset will automatically start an embedded, persistent on-disk MongoDB at `.data/mongo`.*

3. Start the application:
   ```bash
   npm start
   ```
   Or for live-reload development:
   ```bash
   npm run dev
   ```

4. Open your browser:
   **http://127.0.0.1:4321**

---

## Environment Variables

| Variable | Description | Default | Required in Prod |
| :--- | :--- | :--- | :--- |
| `PORT` | HTTP server port | `4321` | No |
| `HOST` | HTTP server host interface | `127.0.0.1` | No |
| `NODE_ENV` | Environment (`development`, `production`, `test`) | `development` | Yes (`production`) |
| `SESSION_SECRET`| Secret key for session cookies | Auto-generated in dev | **Yes** (min 32 chars) |
| `MONGODB_URI` | MongoDB connection string (e.g. Atlas) | Local fallback (`.data/mongo`) | **Yes** |
| `COOKIE_INSECURE`| Set to `'true'` if terminating SSL at a reverse proxy | `false` | No |

---

## Running Automated Tests

```bash
npm test
```
All 57 automated tests run isolated against an in-memory database instance.
