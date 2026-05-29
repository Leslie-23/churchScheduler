const router = require("express").Router();
const { Member, Service, Assignment, Unavailability, getUnitPositionTypes } = require("../database");
const { requireRole } = require("../middleware");

const SERVICE_AVAILABILITY = new Set(["both", "first_only", "second_only"]);

router.get("/", async (req, res) => {
  const members = await Member.find({ unit: req.unit._id }).sort("name").lean();
  res.json(members);
});

router.post("/", requireRole("owner", "admin"), async (req, res) => {
  const { name, gender, has_suit, phone, notes, service_availability } = req.body;
  if (!name || !gender) return res.status(400).json({ error: "Name and gender are required" });
  if (!["M", "F"].includes(gender)) return res.status(400).json({ error: "Invalid gender" });
  if (service_availability && !SERVICE_AVAILABILITY.has(service_availability)) {
    return res.status(400).json({ error: "Invalid service availability" });
  }
  const member = await Member.create({ unit: req.unit._id, name, gender, has_suit: !!has_suit, phone, notes, service_availability: service_availability || "both" });
  res.status(201).json(member);
});

router.get("/flagged/follow-up", async (req, res) => {
  const members = await Member.find({ unit: req.unit._id, active: true }).lean();
  const flagged = [];

  for (const m of members) {
    const recent = await Assignment.find({ member: m._id, attendance: { $ne: "pending" } })
      .sort({ _id: -1 })
      .limit(10)
      .lean();

    if (recent.length < 3) continue;
    const attended = recent.filter((a) => a.attendance === "present" || a.attendance === "excused").length;
    const rate = Math.round((attended / recent.length) * 100);
    if (rate < 70) {
      flagged.push({
        _id: m._id,
        name: m.name,
        phone: m.phone,
        rate,
        recent_absent: recent.filter((a) => a.attendance === "absent").length,
        total_checked: recent.length,
      });
    }
  }

  flagged.sort((a, b) => a.rate - b.rate);
  res.json(flagged);
});

router.put("/:id", requireRole("owner", "admin"), async (req, res) => {
  const { name, gender, has_suit, phone, active, notes, service_availability } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (gender !== undefined) {
    if (!["M", "F"].includes(gender)) return res.status(400).json({ error: "Invalid gender" });
    update.gender = gender;
  }
  if (has_suit !== undefined) update.has_suit = !!has_suit;
  if (phone !== undefined) update.phone = phone;
  if (active !== undefined) update.active = !!active;
  if (notes !== undefined) update.notes = notes;
  if (service_availability !== undefined) {
    if (!SERVICE_AVAILABILITY.has(service_availability || "both")) {
      return res.status(400).json({ error: "Invalid service availability" });
    }
    update.service_availability = service_availability || "both";
  }

  const member = await Member.findOneAndUpdate(
    { _id: req.params.id, unit: req.unit._id },
    update,
    { new: true }
  );
  if (!member) return res.status(404).json({ error: "Member not found" });
  res.json(member);
});

router.delete("/:id", requireRole("owner", "admin"), async (req, res) => {
  const member = await Member.findOneAndDelete({ _id: req.params.id, unit: req.unit._id });
  if (!member) return res.status(404).json({ error: "Member not found" });

  const services = await Service.find({ unit: req.unit._id }).select("_id").lean();
  await Assignment.deleteMany({ member: req.params.id, service: { $in: services.map((s) => s._id) } });
  await Unavailability.deleteMany({ unit: req.unit._id, member: req.params.id });
  res.json({ success: true });
});

router.get("/:id/skills", async (req, res) => {
  const member = await Member.findOne({ _id: req.params.id, unit: req.unit._id }).lean();
  res.json(member ? member.skills : []);
});

router.put("/:id/skills", requireRole("owner", "admin"), async (req, res) => {
  const { skills } = req.body;
  if (!Array.isArray(skills)) return res.status(400).json({ error: "skills array required" });
  const positionTypes = getUnitPositionTypes(req.unit);
  const cleanSkills = [];
  for (const skill of skills) {
    if (!positionTypes[skill.position_type]) return res.status(400).json({ error: "Invalid skill position" });
    const rating = Number(skill.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Invalid skill rating" });
    }
    cleanSkills.push({ position_type: skill.position_type, rating });
  }
  const member = await Member.findOneAndUpdate({ _id: req.params.id, unit: req.unit._id }, { skills: cleanSkills });
  if (!member) return res.status(404).json({ error: "Member not found" });
  res.json({ success: true });
});

router.get("/:id/history", async (req, res) => {
  const member = await Member.findOne({ _id: req.params.id, unit: req.unit._id }).select("_id").lean();
  if (!member) return res.status(404).json({ error: "Member not found" });

  const assignments = await Assignment.find({ member: req.params.id })
    .populate("service")
    .sort({ _id: -1 })
    .lean();

  const history = assignments
    .filter((a) => a.service && a.service.unit.toString() === req.unit._id.toString())
    .map((a) => ({
      date: a.service.date,
      service_type: a.service.service_type,
      position_type: a.position_type,
      attendance: a.attendance || "pending",
    }))
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .slice(0, 10);

  res.json(history);
});

router.get("/:id/attendance", async (req, res) => {
  const member = await Member.findOne({ _id: req.params.id, unit: req.unit._id }).select("_id").lean();
  if (!member) return res.status(404).json({ error: "Member not found" });

  const assignments = await Assignment.find({ member: req.params.id })
    .populate("service")
    .lean();

  const unitAssignments = assignments.filter(
    (a) => a.service && a.service.unit.toString() === req.unit._id.toString()
  );

  const total = unitAssignments.length;
  const marked = unitAssignments.filter((a) => a.attendance && a.attendance !== "pending");
  const present = marked.filter((a) => a.attendance === "present").length;
  const absent = marked.filter((a) => a.attendance === "absent").length;
  const excused = marked.filter((a) => a.attendance === "excused").length;
  const rate = marked.length > 0 ? Math.round(((present + excused) / marked.length) * 100) : null;

  res.json({ total, present, absent, excused, rate });
});

module.exports = router;
