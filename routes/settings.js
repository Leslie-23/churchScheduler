const router = require("express").Router();
const { PositionCount, POSITION_TYPES, SERVICE_TYPES } = require("../database");
const { requireRole } = require("../middleware");

router.get("/constants", (req, res) => {
  res.json({ positionTypes: POSITION_TYPES, serviceTypes: SERVICE_TYPES });
});

router.get("/position-counts/:serviceType", async (req, res) => {
  const counts = await PositionCount.find({
    unit: req.unit._id,
    service_type: req.params.serviceType,
  }).lean();
  res.json(counts);
});

router.put("/position-counts/:serviceType", requireRole("owner", "admin"), async (req, res) => {
  const { counts } = req.body;
  for (const c of counts) {
    await PositionCount.findOneAndUpdate(
      { unit: req.unit._id, service_type: req.params.serviceType, position_type: c.position_type },
      { count: c.count },
      { upsert: true }
    );
  }
  res.json({ success: true });
});

module.exports = router;
