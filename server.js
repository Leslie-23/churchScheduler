require("dotenv").config();
const express = require("express");
const path = require("path");
const passport = require("passport");
const { connectDb, DEFAULT_POSITION_TYPES, DEFAULT_SERVICE_TYPES, Unit, getUnitPositionTypes, getUnitServiceTypes } = require("./database");
const { setupPassport, generateToken } = require("./auth");
const { requireAuth, requireAuthPage, requireUnit } = require("./middleware");

const app = express();

app.use(express.json());
app.use(passport.initialize());
setupPassport();

// --- Public static (landing, login, signup, onboarding) ---
app.use(express.static(path.join(__dirname, "public")));

// --- Auth API (no auth required) ---
app.use("/api/auth", require("./routes/auth"));

// --- Google OAuth ---
if (process.env.GOOGLE_CLIENT_ID) {
  app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"], session: false }));

  app.get("/auth/google/callback",
    passport.authenticate("google", { session: false, failureRedirect: "/login.html" }),
    (req, res) => {
      const token = generateToken(req.user.user._id);
      const dest = req.user.hasUnits ? "/app" : "/onboarding.html";
      res.redirect(`/auth-callback.html?token=${token}&redirect=${dest}`);
    }
  );
}

app.get("/api/constants", async (req, res) => {
  const authHeader = req.headers.authorization;
  const unitId = req.headers["x-unit-id"];
  if (authHeader && unitId) {
    try {
      const unit = await Unit.findById(unitId).lean();
      if (unit) {
        return res.json({
          positionTypes: getUnitPositionTypes(unit),
          serviceTypes: getUnitServiceTypes(unit),
        });
      }
    } catch {}
  }
  res.json({ positionTypes: DEFAULT_POSITION_TYPES, serviceTypes: DEFAULT_SERVICE_TYPES });
});

// --- Protected API routes ---
app.use("/api/units", requireAuth, require("./routes/units"));
app.use("/api/members", requireAuth, requireUnit, require("./routes/members"));
app.use("/api/services", requireAuth, requireUnit, require("./routes/services"));
app.use("/api/unavailability", requireAuth, requireUnit, require("./routes/unavailability"));
app.use("/api/settings", requireAuth, requireUnit, require("./routes/settings"));
app.use("/api/ai", requireAuth, requireUnit, require("./routes/ai"));
app.use("/api/sms", requireAuth, requireUnit, require("./routes/sms"));

// --- Serve protected app SPA ---
app.use("/app", express.static(path.join(__dirname, "app")));
app.get("/app", (_req, res) => {
  res.sendFile(path.join(__dirname, "app", "index.html"));
});
app.get("/app/*", (_req, res) => {
  res.sendFile(path.join(__dirname, "app", "index.html"));
});

// --- Start ---
connectDb();

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  connectDb().then(() => {
    app.listen(PORT, () => {
      console.log(`Stewardly running at http://localhost:${PORT}`);
      if (process.env.GROQ_API_KEY) console.log("Groq AI reporting: ENABLED");
      else console.log("Groq AI reporting: DISABLED (set GROQ_API_KEY to enable)");
      if (process.env.GOOGLE_CLIENT_ID) console.log("Google OAuth: ENABLED");
      else console.log("Google OAuth: DISABLED (set GOOGLE_CLIENT_ID to enable)");
      if (process.env.ARKESEL_API_KEY) console.log("Arkesel SMS: ENABLED");
      else console.log("Arkesel SMS: DISABLED (set ARKESEL_API_KEY to enable)");
    });
  });
}

module.exports = app;
