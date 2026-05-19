const { verifyToken } = require("./auth");
const { User, UnitMembership } = require("./database");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const decoded = verifyToken(header.split(" ")[1]);
    const user = await User.findById(decoded.userId).lean();
    if (!user) return res.status(401).json({ error: "User not found" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function requireAuthPage(req, res, next) {
  const header = req.headers.authorization;
  const cookieToken = req.query.token;
  const token = (header && header.startsWith("Bearer ")) ? header.split(" ")[1] : cookieToken;

  if (!token) return res.redirect("/login.html");

  try {
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId).lean();
    if (!user) return res.redirect("/login.html");
    req.user = user;
    next();
  } catch {
    return res.redirect("/login.html");
  }
}

async function requireUnit(req, res, next) {
  const unitId = req.headers["x-unit-id"];
  if (!unitId) return res.status(400).json({ error: "X-Unit-Id header required" });

  const membership = await UnitMembership.findOne({
    user: req.user._id,
    unit: unitId,
  }).populate("unit").lean();

  if (!membership) return res.status(403).json({ error: "Not a member of this unit" });

  req.unit = membership.unit;
  req.membership = membership;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.membership) return res.status(403).json({ error: "No unit context" });
    if (!roles.includes(req.membership.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

module.exports = { requireAuth, requireAuthPage, requireUnit, requireRole };
