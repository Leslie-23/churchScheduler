const router = require("express").Router();
const { Service, Assignment, Member, Unavailability, getUnitPositionTypes, getUnitServiceTypes } = require("../database");
const { requireRole } = require("../middleware");
const { generateSchedule, suggestReplacements } = require("../scheduler");

async function findServiceInUnit(serviceId, unitId) {
  return Service.findOne({ _id: serviceId, unit: unitId });
}

async function findMemberInUnit(memberId, unitId) {
  return Member.findOne({ _id: memberId, unit: unitId }).select("_id").lean();
}

async function findAssignmentInService(assignmentId, serviceId) {
  return Assignment.findOne({ _id: assignmentId, service: serviceId });
}

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
  const { date, service_type, name, service_slot } = req.body;
  if (!date || !service_type) return res.status(400).json({ error: "Date and type are required" });
  if (!getUnitServiceTypes(req.unit)[service_type]) return res.status(400).json({ error: "Invalid service_type" });
  const slot = service_slot || 1;
  const existing = await Service.findOne({ unit: req.unit._id, date, service_type, service_slot: slot });
  if (existing) return res.status(409).json({ error: `A ${service_type} service (${slot === 1 ? "1st" : "2nd"} service) already exists on ${date}` });
  const service = await Service.create({ unit: req.unit._id, date, service_type, name, service_slot: slot });
  res.status(201).json(service);
});

router.delete("/:id", requireRole("owner", "admin"), async (req, res) => {
  const service = await Service.findOneAndDelete({ _id: req.params.id, unit: req.unit._id });
  if (!service) return res.status(404).json({ error: "Service not found" });
  await Assignment.deleteMany({ service: service._id });
  res.json({ success: true });
});

router.put("/:id/status", requireRole("owner", "admin"), async (req, res) => {
  const { status } = req.body;
  if (!["draft", "published"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  const service = await Service.findOneAndUpdate(
    { _id: req.params.id, unit: req.unit._id },
    { status },
    { new: true }
  );
  if (!service) return res.status(404).json({ error: "Service not found" });
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
  if (!position_type || !remove_member_id) {
    return res.status(400).json({ error: "position_type and remove_member_id are required" });
  }
  if (!getUnitPositionTypes(req.unit)[position_type]) return res.status(400).json({ error: "Invalid position_type" });
  const service = await findServiceInUnit(req.params.id, req.unit._id);
  if (!service) return res.status(404).json({ error: "Service not found" });
  if (remove_member_id) {
    const member = await findMemberInUnit(remove_member_id, req.unit._id);
    if (!member) return res.status(404).json({ error: "Member not found" });
  }
  const result = await suggestReplacements(req.params.id, position_type, remove_member_id);
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

router.post("/:id/replace", requireRole("owner", "admin"), async (req, res) => {
  const { assignment_id, new_member_id, old_member_id, date } = req.body;
  if (!assignment_id || !new_member_id || !old_member_id || !date) {
    return res.status(400).json({ error: "assignment_id, new_member_id, old_member_id, and date are required" });
  }

  const service = await findServiceInUnit(req.params.id, req.unit._id);
  if (!service) return res.status(404).json({ error: "Service not found" });

  const [assignment, newMember, oldMember] = await Promise.all([
    findAssignmentInService(assignment_id, service._id),
    findMemberInUnit(new_member_id, req.unit._id),
    findMemberInUnit(old_member_id, req.unit._id),
  ]);
  if (!assignment) return res.status(404).json({ error: "Assignment not found" });
  if (!newMember || !oldMember) return res.status(404).json({ error: "Member not found" });
  if (assignment.member.toString() !== old_member_id) {
    return res.status(400).json({ error: "Assignment does not belong to the removed member" });
  }

  await Unavailability.findOneAndUpdate(
    { unit: req.unit._id, member: old_member_id, date },
    { member: old_member_id, date, unit: req.unit._id, reason: "Marked unavailable" },
    { upsert: true }
  );

  assignment.member = new_member_id;
  await assignment.save();
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
    attendance: a.attendance || "pending",
  }));
  res.json(result);
});

router.put("/:id/attendance", requireRole("owner", "admin"), async (req, res) => {
  const { attendance } = req.body;
  if (!attendance || !Array.isArray(attendance)) return res.status(400).json({ error: "attendance array required" });

  const service = await findServiceInUnit(req.params.id, req.unit._id);
  if (!service) return res.status(404).json({ error: "Service not found" });

  let updated = 0;
  for (const entry of attendance) {
    if (!entry.assignment_id || !entry.status) continue;
    if (!["present", "absent", "excused"].includes(entry.status)) continue;
    const result = await Assignment.updateOne(
      { _id: entry.assignment_id, service: service._id },
      { attendance: entry.status }
    );
    updated += result.modifiedCount;
  }

  res.json({ success: true, updated });
});

router.put("/assignments/:id", requireRole("owner", "admin"), async (req, res) => {
  const { member_id, position_type } = req.body;
  if (!member_id || !position_type) {
    return res.status(400).json({ error: "member_id and position_type are required" });
  }
  if (!getUnitPositionTypes(req.unit)[position_type]) return res.status(400).json({ error: "Invalid position_type" });
  const assignment = await Assignment.findById(req.params.id).populate("service");
  if (!assignment || !assignment.service || assignment.service.unit.toString() !== req.unit._id.toString()) {
    return res.status(404).json({ error: "Assignment not found" });
  }
  if (member_id) {
    const member = await findMemberInUnit(member_id, req.unit._id);
    if (!member) return res.status(404).json({ error: "Member not found" });
  }
  assignment.member = member_id;
  assignment.position_type = position_type;
  await assignment.save();
  res.json({ success: true });
});

router.delete("/assignments/:id", requireRole("owner", "admin"), async (req, res) => {
  const assignment = await Assignment.findById(req.params.id).populate("service");
  if (!assignment || !assignment.service || assignment.service.unit.toString() !== req.unit._id.toString()) {
    return res.status(404).json({ error: "Assignment not found" });
  }
  await assignment.deleteOne();
  res.json({ success: true });
});

router.post("/:id/assignments", requireRole("owner", "admin"), async (req, res) => {
  const { member_id, position_type } = req.body;
  if (!member_id || !position_type) {
    return res.status(400).json({ error: "member_id and position_type are required" });
  }
  if (!getUnitPositionTypes(req.unit)[position_type]) return res.status(400).json({ error: "Invalid position_type" });
  const [service, member] = await Promise.all([
    findServiceInUnit(req.params.id, req.unit._id),
    findMemberInUnit(member_id, req.unit._id),
  ]);
  if (!service) return res.status(404).json({ error: "Service not found" });
  if (!member) return res.status(404).json({ error: "Member not found" });

  const assignment = await Assignment.create({ service: service._id, member: member_id, position_type });
  res.status(201).json(assignment);
});

module.exports = router;
