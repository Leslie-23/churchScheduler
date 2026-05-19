const router = require("express").Router();
const { Member, Assignment, Unavailability } = require("../database");
const { requireRole } = require("../middleware");

router.get("/", async (req, res) => {
  const members = await Member.find({ unit: req.unit._id }).sort("name").lean();
  res.json(members);
});

router.post("/", requireRole("owner", "admin"), async (req, res) => {
  const { name, gender, has_suit, phone, notes } = req.body;
  if (!name || !gender) return res.status(400).json({ error: "Name and gender are required" });
  const member = await Member.create({ unit: req.unit._id, name, gender, has_suit: !!has_suit, phone, notes });
  res.status(201).json(member);
});

router.put("/:id", requireRole("owner", "admin"), async (req, res) => {
  const { name, gender, has_suit, phone, active, notes } = req.body;
  const member = await Member.findOneAndUpdate(
    { _id: req.params.id, unit: req.unit._id },
    { name, gender, has_suit: !!has_suit, phone, active: !!active, notes },
    { new: true }
  );
  res.json(member);
});

router.delete("/:id", requireRole("owner", "admin"), async (req, res) => {
  await Member.findOneAndDelete({ _id: req.params.id, unit: req.unit._id });
  await Assignment.deleteMany({ member: req.params.id });
  await Unavailability.deleteMany({ member: req.params.id });
  res.json({ success: true });
});

router.get("/:id/skills", async (req, res) => {
  const member = await Member.findOne({ _id: req.params.id, unit: req.unit._id }).lean();
  res.json(member ? member.skills : []);
});

router.put("/:id/skills", requireRole("owner", "admin"), async (req, res) => {
  const { skills } = req.body;
  await Member.findOneAndUpdate({ _id: req.params.id, unit: req.unit._id }, { skills });
  res.json({ success: true });
});

router.get("/:id/history", async (req, res) => {
  const assignments = await Assignment.find({ member: req.params.id })
    .populate("service")
    .sort({ "service.date": -1 })
    .lean();

  const history = assignments
    .filter((a) => a.service && a.service.unit.toString() === req.unit._id.toString())
    .map((a) => ({
      date: a.service.date,
      service_type: a.service.service_type,
      position_type: a.position_type,
    }))
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .slice(0, 10);

  res.json(history);
});

module.exports = router;
