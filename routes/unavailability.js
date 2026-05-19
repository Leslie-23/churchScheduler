const router = require("express").Router();
const { Unavailability } = require("../database");

router.get("/", async (req, res) => {
  const filter = { unit: req.unit._id };
  if (req.query.date) filter.date = req.query.date;
  const records = await Unavailability.find(filter).populate("member").lean();
  const result = records.map((u) => ({
    _id: u._id,
    member: u.member._id,
    member_name: u.member.name,
    date: u.date,
    reason: u.reason,
  }));
  res.json(result);
});

router.post("/", async (req, res) => {
  const { member_id, date, reason } = req.body;

  if (req.membership.role === "member") {
    if (!req.membership.member || req.membership.member.toString() !== member_id) {
      return res.status(403).json({ error: "Members can only mark themselves unavailable" });
    }
  }

  try {
    const record = await Unavailability.create({ unit: req.unit._id, member: member_id, date, reason });
    res.status(201).json(record);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: "Already marked unavailable" });
    throw e;
  }
});

router.delete("/:id", async (req, res) => {
  const record = await Unavailability.findOne({ _id: req.params.id, unit: req.unit._id });
  if (!record) return res.status(404).json({ error: "Not found" });

  if (req.membership.role === "member") {
    if (!req.membership.member || req.membership.member.toString() !== record.member.toString()) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
  }

  await record.deleteOne();
  res.json({ success: true });
});

module.exports = router;
