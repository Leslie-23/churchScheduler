<p align="center">
  <img src="public/favicon.svg" width="56" height="56" alt="Stewardly logo">
</p>

<h1 align="center">Stewardly</h1>

<p align="center">
  Smart duty scheduling for service teams.
  <br>
  <strong>Churches &middot; Nonprofits &middot; Volunteer Organizations</strong>
  <br><br>
  <a href="https://wci-scheduler.vercel.app">Live App</a> &nbsp;&middot;&nbsp;
  <a href="#features">Features</a> &nbsp;&middot;&nbsp;
  <a href="#getting-started">Getting Started</a>
</p>

---

## What is Stewardly?

Stewardly replaces spreadsheets, WhatsApp threads, and guesswork with a scheduling system purpose-built for service teams. If your organization has people, positions, and a weekly roster — Stewardly handles the rest.

**One click** generates a fair, skill-balanced duty roster. The algorithm considers each member's skills, availability, rotation history, attire requirements, and reliability score. When someone cancels, ranked replacement suggestions appear in seconds.

Built for ushering units, media teams, protocol squads, choir sections, children's ministry, hospitality crews — any team that needs a weekly schedule.

## Features

| Feature | Description |
|---|---|
| **Auto Scheduling** | One-click roster generation weighted by skill ratings, rotation fairness, suit/attire requirements, and gender constraints |
| **Smart Replacements** | Ranked candidate suggestions with scores and reasoning when a member cancels |
| **Attendance Tracking** | Mark present/absent/excused after each service. Poor attendance triggers follow-up flags |
| **SMS Notifications** | Personalized duty reminders and broadcast messages sent directly to members' phones |
| **AI Reports** | Ask natural language questions about workload balance, rotation gaps, and team readiness |
| **Multi-Service** | Supports first/second service slots with per-member availability preferences |
| **Custom Positions** | Define your own position types with skill, suit, and gender requirements |
| **Multi-Unit** | Manage multiple teams from one account. Each unit has its own members, schedules, and settings |
| **Unit Discovery** | New members can browse and request to join units. Admins approve or deny requests |
| **Role Management** | Three-tier permissions: Owner, Admin, Member. Admins can manage rosters and approve joins |
| **PWA** | Install as a mobile app. Offline-capable with splash screen and native app feel |
| **Google OAuth** | One-tap sign in with Google, or use email/password |

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express |
| Database | MongoDB, Mongoose |
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Auth | JWT, Passport.js, Google OAuth 2.0 |
| AI | Groq (LLaMA) |
| SMS | Arkesel API |
| Hosting | Vercel (serverless) |
| PWA | Service Worker, Web App Manifest |

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)

### Installation

```bash
git clone https://github.com/Leslie-23/wci-scheduler.git
cd wci-scheduler
npm install
```

### Environment Variables

Create a `.env` file in the root:

```env
MONGO_URI=mongodb://127.0.0.1:27017/churchscheduler
JWT_SECRET=your-secret-key

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Groq AI reports (optional)
GROQ_API_KEY=your-groq-key

# Arkesel SMS (optional)
ARKESEL_API_KEY=your-arkesel-key
ARKESEL_SENDER_ID=YourOrg
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
├── server.js              # Express app, routes, OAuth, static serving
├── database.js            # Mongoose schemas and models
├── auth.js                # Passport setup, JWT helpers
├── middleware.js           # Auth, unit, and role middleware
├── routes/
│   ├── auth.js            # Signup, login, profile
│   ├── units.js           # Unit CRUD, discovery, join requests, roles
│   ├── members.js         # Member management, skills, availability
│   ├── services.js        # Service creation, auto-scheduling, attendance
│   ├── settings.js        # Position counts, unit configuration
│   ├── ai.js              # AI-powered reports
│   ├── sms.js             # SMS notifications and broadcasts
│   └── unavailability.js  # Member unavailability dates
├── app/                   # Protected SPA (dashboard)
│   ├── index.html
│   ├── app.js
│   └── style.css
├── public/                # Landing page, auth pages, PWA assets
│   ├── index.html         # Landing page
│   ├── login.html
│   ├── signup.html
│   ├── manifest.json
│   └── sw.js              # Service worker
└── package.json
```

## Scheduling Algorithm

The auto-scheduler scores every eligible member for each open position slot using four weighted factors:

1. **Skill match** — higher-rated members for a position score higher
2. **Rotation fairness** — members who haven't served recently get priority
3. **Position variety** — avoids assigning the same position repeatedly
4. **Reliability** — attendance history influences selection

Hard constraints (suit ownership, gender requirements, availability, already-assigned status) filter candidates before scoring. The result is a balanced roster where no one is overworked and skilled members are placed where they're needed most.

## License

MIT

---

<p align="center">
  <a href="https://wci-scheduler.vercel.app"><strong>Try Stewardly &rarr;</strong></a>
</p>
