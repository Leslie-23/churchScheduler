const router = require("express").Router();
const { Service, Assignment } = require("../database");
const { requireRole } = require("../middleware");
const { generateSchedule, suggestReplacements } = require("../scheduler");

router.get("/", async (req, res) => {
  let query = { unit: req.unit._id };
  let sort = { date: -1 };
  if (req.query.upcoming === "true") {
    const today = new Date().toISOString().split("T")[0];
    query.date = { $gte: today };
    sort = { date: 1 };
  }
  const services = await Service.find(query).sort(sort).lean();
  res.json(services);
});

router.post("/", requireRole("owner", "admin"), async (req, res) => {
  const { date, service_type, name } = req.body;
  if (!date || !service_type) return res.status(400).json({ error: "Date and type are required" });
  const existing = await Service.findOne({ unit: req.unit._id, date, service_type });
  if (existing) return res.status(409).json({ error: `A ${service_type} service already exists on ${date}` });
  const service = await Service.create({ unit: req.unit._id, date, service_type, name });
  res.status(201).json(service);
});

router.delete("/:id", requireRole("owner", "admin"), async (req, res) => {
  await Service.findOneAndDelete({ _id: req.params.id, unit: req.unit._id });
  await Assignment.deleteMany({ service: req.params.id });
  res.json({ success: true });
});

router.put("/:id/status", requireRole("owner", "admin"), async (req, res) => {
  const { status } = req.body;
  const service = await Service.findOneAndUpdate(
    { _id: req.params.id, unit: req.unit._id },
    { status },
    { new: true }
  );
  res.json(service);
});

router.post("/:id/generate", requireRole("owner", "admin"), async (req, res) => {
  const service = await Service.findOne({ _id: req.params.id, unit: req.unit._id });
  if (!service) return res.status(404).json({ error: "Service not found" });
  const result = await generateSchedule(req.params.id);
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

router.post("/:id/suggest-replacement", requireRole("owner", "admin"), async (req, res) => {
  const { position_type, remove_member_id } = req.body;
  const result = await suggestReplacements(req.params.id, position_type, remove_member_id);
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

router.post("/:id/replace", requireRole("owner", "admin"), async (req, res) => {
  const { assignment_id, new_member_id, old_member_id, date } = req.body;

  const { Unavailability } = require("../database");
  await Unavailability.findOneAndUpdate(
    { member: old_member_id, date },
    { member: old_member_id, date, unit: req.unit._id, reason: "Marked unavailable" },
    { upsert: true }
  );

  await Assignment.findByIdAndUpdate(assignment_id, { member: new_member_id });
  res.json({ success: true });
});

router.get("/:id/assignments", async (req, res) => {
  const service = await Service.findOne({ _id: req.params.id, unit: req.unit._id });
  if (!service) return res.status(404).json({ error: "Service not found" });

  const assignments = await Assignment.find({ service: req.params.id })
    .populate("member")
    .sort("position_type")
    .lean();

  const result = assignments.map((a) => ({
    _id: a._id,
    service: a.service,
    member: a.member._id,
    member_name: a.member.name,
    gender: a.member.gender,
    has_suit: a.member.has_suit,
    position_type: a.position_type,
  }));
  res.json(result);
});

router.put("/assignments/:id", requireRole("owner", "admin"), async (req, res) => {
  const { member_id, position_type } = req.body;
  await Assignment.findByIdAndUpdate(req.params.id, { member: member_id, position_type });
  res.json({ success: true });
});

router.delete("/assignments/:id", requireRole("owner", "admin"), async (req, res) => {
  await Assignment.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

router.post("/:id/assignments", requireRole("owner", "admin"), async (req, res) => {
  const { member_id, position_type } = req.body;
  const assignment = await Assignment.create({ service: req.params.id, member: member_id, position_type });
  res.status(201).json(assignment);
});

module.exports = router;
