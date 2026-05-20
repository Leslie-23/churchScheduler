const router = require("express").Router();
const crypto = require("crypto");
const { Unit, UnitMembership, Member, JoinRequest, seedPositionCounts } = require("../database");
const { requireUnit, requireRole } = require("../middleware");

router.get("/", async (req, res) => {
  const memberships = await UnitMembership.find({ user: req.user._id }).populate("unit").lean();
  res.json(memberships.map((m) => ({
    _id: m.unit._id,
    name: m.unit.name,
    description: m.unit.description,
    invite_code: m.unit.invite_code,
    role: m.role,
  })));
});

router.post("/", async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: "Unit name is required" });

  const unit = await Unit.create({ name, description, created_by: req.user._id });

  const user = req.user;
  const member = await Member.create({
    unit: unit._id,
    name: user.name,
    gender: user.gender || "M",
    has_suit: false,
    phone: user.phone || "",
    skills: [],
  });

  await UnitMembership.create({ user: req.user._id, unit: unit._id, role: "owner", member: member._id });
  await seedPositionCounts(unit._id);

  res.status(201).json({
    _id: unit._id,
    name: unit.name,
    description: unit.description,
    invite_code: unit.invite_code,
    role: "owner",
  });
});

router.post("/join", async (req, res) => {
  const { invite_code } = req.body;
  if (!invite_code) return res.status(400).json({ error: "Invite code is required" });

  const unit = await Unit.findOne({ invite_code: invite_code.trim().toLowerCase() });
  if (!unit) return res.status(404).json({ error: "Invalid invite code" });

  const existing = await UnitMembership.findOne({ user: req.user._id, unit: unit._id });
  if (existing) return res.status(409).json({ error: "Already a member of this unit" });

  const user = req.user;
  const member = await Member.create({
    unit: unit._id,
    name: user.name,
    gender: user.gender || "M",
    has_suit: false,
    phone: user.phone || "",
    notes: "Joined via invite code",
    skills: [],
  });

  await UnitMembership.create({
    user: req.user._id,
    unit: unit._id,
    role: "member",
    member: member._id,
  });

  res.json({
    _id: unit._id,
    name: unit.name,
    description: unit.description,
    role: "member",
  });
});

// --- Unit discovery (browse all units) ---
router.get("/discover", async (req, res) => {
  const q = (req.query.q || "").trim();
  const filter = q ? { name: { $regex: q, $options: "i" } } : {};
  const units = await Unit.find(filter).select("name description").sort({ name: 1 }).limit(50).lean();
  const userMemberships = await UnitMembership.find({ user: req.user._id }).select("unit").lean();
  const memberUnitIds = new Set(userMemberships.map((m) => m.unit.toString()));
  const pendingRequests = await JoinRequest.find({ user: req.user._id, status: "pending" }).select("unit").lean();
  const pendingUnitIds = new Set(pendingRequests.map((r) => r.unit.toString()));

  res.json(units.map((u) => ({
    _id: u._id,
    name: u.name,
    description: u.description,
    is_member: memberUnitIds.has(u._id.toString()),
    has_pending_request: pendingUnitIds.has(u._id.toString()),
  })));
});

// --- Join requests ---
router.get("/my-requests", async (req, res) => {
  const requests = await JoinRequest.find({ user: req.user._id })
    .populate("unit", "name")
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  res.json(requests.map((r) => ({
    _id: r._id,
    unit: { _id: r.unit._id, name: r.unit.name },
    status: r.status,
    createdAt: r.createdAt,
  })));
});

router.post("/request-join", async (req, res) => {
  const { unit_id } = req.body;
  if (!unit_id) return res.status(400).json({ error: "Unit is required" });

  const unit = await Unit.findById(unit_id);
  if (!unit) return res.status(404).json({ error: "Unit not found" });

  const existing = await UnitMembership.findOne({ user: req.user._id, unit: unit_id });
  if (existing) return res.status(409).json({ error: "Already a member of this unit" });

  const pending = await JoinRequest.findOne({ user: req.user._id, unit: unit_id, status: "pending" });
  if (pending) return res.status(409).json({ error: "You already have a pending request for this unit" });

  const request = await JoinRequest.create({ user: req.user._id, unit: unit_id });
  res.status(201).json({ _id: request._id, status: "pending", unit: { _id: unit._id, name: unit.name } });
});

router.get("/:id", requireUnit, async (req, res) => {
  const memberCount = await UnitMembership.countDocuments({ unit: req.unit._id });
  res.json({
    _id: req.unit._id,
    name: req.unit.name,
    description: req.unit.description,
    invite_code: req.unit.invite_code,
    member_count: memberCount,
  });
});

router.put("/:id", requireUnit, requireRole("owner"), async (req, res) => {
  const { name, description } = req.body;
  await Unit.findByIdAndUpdate(req.unit._id, { name, description });
  res.json({ success: true });
});

router.post("/:id/regenerate-invite", requireUnit, requireRole("owner", "admin"), async (req, res) => {
  const code = crypto.randomBytes(4).toString("hex");
  await Unit.findByIdAndUpdate(req.unit._id, { invite_code: code });
  res.json({ invite_code: code });
});

router.get("/:id/members", requireUnit, async (req, res) => {
  const memberships = await UnitMembership.find({ unit: req.unit._id })
    .populate("user", "name email avatar")
    .populate("member", "name")
    .lean();

  res.json(memberships.map((m) => ({
    _id: m._id,
    user: { _id: m.user._id, name: m.user.name, email: m.user.email, avatar: m.user.avatar },
    role: m.role,
    member: m.member ? { _id: m.member._id, name: m.member.name } : null,
  })));
});

// --- Join request management (admin/owner) ---
router.get("/:id/join-requests", requireUnit, requireRole("owner", "admin"), async (req, res) => {
  const requests = await JoinRequest.find({ unit: req.unit._id, status: "pending" })
    .populate("user", "name email")
    .sort({ createdAt: 1 })
    .lean();
  res.json(requests.map((r) => ({
    _id: r._id,
    user: { _id: r.user._id, name: r.user.name, email: r.user.email },
    createdAt: r.createdAt,
  })));
});

router.put("/:id/join-requests/:requestId", requireUnit, requireRole("owner", "admin"), async (req, res) => {
  const { action } = req.body;
  if (!["approve", "deny"].includes(action)) return res.status(400).json({ error: "Invalid action" });

  const request = await JoinRequest.findOne({ _id: req.params.requestId, unit: req.unit._id, status: "pending" }).populate("user");
  if (!request) return res.status(404).json({ error: "Request not found or already handled" });

  if (action === "deny") {
    request.status = "denied";
    await request.save();
    return res.json({ success: true, status: "denied" });
  }

  const existing = await UnitMembership.findOne({ user: request.user._id, unit: req.unit._id });
  if (existing) {
    request.status = "approved";
    await request.save();
    return res.status(409).json({ error: "User is already a member" });
  }

  const member = await Member.create({
    unit: req.unit._id,
    name: request.user.name,
    gender: request.user.gender || "M",
    has_suit: false,
    phone: request.user.phone || "",
    notes: "Joined via request approval",
    skills: [],
  });

  await UnitMembership.create({
    user: request.user._id,
    unit: req.unit._id,
    role: "member",
    member: member._id,
  });

  request.status = "approved";
  await request.save();
  res.json({ success: true, status: "approved" });
});

router.put("/:id/members/:membershipId/role", requireUnit, requireRole("owner", "admin"), async (req, res) => {
  const { role } = req.body;
  if (!["admin", "member"].includes(role)) return res.status(400).json({ error: "Invalid role" });

  const target = await UnitMembership.findById(req.params.membershipId);
  if (!target) return res.status(404).json({ error: "Membership not found" });
  if (target.role === "owner") return res.status(400).json({ error: "Cannot change owner's role" });
  if (req.membership.role === "admin" && target.role === "admin") {
    return res.status(403).json({ error: "Admins cannot demote other admins" });
  }

  await UnitMembership.findByIdAndUpdate(req.params.membershipId, { role });
  res.json({ success: true });
});

router.delete("/:id/members/:membershipId", requireUnit, requireRole("owner", "admin"), async (req, res) => {
  const membership = await UnitMembership.findById(req.params.membershipId);
  if (!membership) return res.status(404).json({ error: "Membership not found" });
  if (membership.role === "owner") return res.status(400).json({ error: "Cannot remove owner" });
  await membership.deleteOne();
  res.json({ success: true });
});

router.put("/:id/members/:membershipId/link", requireUnit, requireRole("owner", "admin"), async (req, res) => {
  const { member_id } = req.body;
  await UnitMembership.findByIdAndUpdate(req.params.membershipId, { member: member_id || null });
  res.json({ success: true });
});

module.exports = router;
