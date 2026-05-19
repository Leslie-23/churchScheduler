const router = require("express").Router();
const crypto = require("crypto");
const { Unit, UnitMembership, Member, seedPositionCounts } = require("../database");
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
  await UnitMembership.create({ user: req.user._id, unit: unit._id, role: "owner" });
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

  await UnitMembership.create({ user: req.user._id, unit: unit._id, role: "member" });

  res.json({
    _id: unit._id,
    name: unit.name,
    description: unit.description,
    role: "member",
  });
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

router.put("/:id/members/:membershipId/role", requireUnit, requireRole("owner"), async (req, res) => {
  const { role } = req.body;
  if (!["admin", "member"].includes(role)) return res.status(400).json({ error: "Invalid role" });
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
