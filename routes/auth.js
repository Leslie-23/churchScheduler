const router = require("express").Router();
const { User, UnitMembership } = require("../database");
const { hashPassword, comparePassword, generateToken } = require("../auth");
const { requireAuth } = require("../middleware");

router.post("/signup", async (req, res) => {
  const { name, email, password, phone, gender } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: "Name, email, and password are required" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const password_hash = await hashPassword(password);
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password_hash,
    phone: phone || "",
    gender: gender || "",
  });
  const token = generateToken(user._id);

  res.status(201).json({
    token,
    user: { _id: user._id, name: user.name, email: user.email, avatar: user.avatar },
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.password_hash) return res.status(401).json({ error: "Invalid email or password" });

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  const token = generateToken(user._id);

  res.json({
    token,
    user: { _id: user._id, name: user.name, email: user.email, avatar: user.avatar },
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const memberships = await UnitMembership.find({ user: req.user._id })
    .populate("unit")
    .populate("member")
    .lean();

  res.json({
    user: {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      avatar: req.user.avatar,
      phone: req.user.phone,
    },
    memberships: memberships.map((m) => ({
      _id: m._id,
      unit: { _id: m.unit._id, name: m.unit.name, invite_code: m.unit.invite_code },
      role: m.role,
      member: m.member ? { _id: m.member._id, name: m.member.name } : null,
    })),
  });
});

router.put("/profile", requireAuth, async (req, res) => {
  const { name, phone } = req.body;
  const update = {};
  if (name) update.name = name;
  if (phone !== undefined) update.phone = phone;
  await User.findByIdAndUpdate(req.user._id, update);
  res.json({ success: true });
});

router.post("/change-password", requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters" });

  const user = await User.findById(req.user._id);
  if (user.password_hash) {
    if (!current_password) return res.status(400).json({ error: "Current password required" });
    const valid = await comparePassword(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });
  }

  user.password_hash = await hashPassword(new_password);
  await user.save();
  res.json({ success: true });
});

module.exports = router;
