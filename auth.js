const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User, UnitMembership } = require("./database");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRY = "7d";

function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function setupPassport() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/auth/google/callback` : "http://localhost:3000/auth/google/callback");

  if (!clientID || !clientSecret) {
    console.log("Google OAuth: DISABLED (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable)");
    return;
  }

  passport.use(new GoogleStrategy({
    clientID,
    clientSecret,
    callbackURL,
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value?.toLowerCase();
      if (!email) return done(new Error("Google profile email is required"));
      if (!profile.id) return done(new Error("Google profile id is required"));

      let user = await User.findOne({ google_id: profile.id });

      if (!user) {
        user = await User.findOne({ email });
        const avatar = profile.photos?.[0]?.value || "";
        const name = profile.displayName || email.split("@")[0];

        if (user) {
          user.google_id = profile.id;
          if (!user.avatar && avatar) user.avatar = avatar;
          await user.save();
        } else {
          user = await User.create({
            name,
            email,
            google_id: profile.id,
            avatar,
          });
        }
      }

      const memberships = await UnitMembership.find({ user: user._id });
      done(null, { user, hasUnits: memberships.length > 0 });
    } catch (err) {
      done(err);
    }
  }));

  passport.serializeUser((data, done) => done(null, data));
  passport.deserializeUser((data, done) => done(null, data));

  console.log("Google OAuth: ENABLED");
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  setupPassport,
};
