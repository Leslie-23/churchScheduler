const router = require("express").Router();
const { PositionCount, Unit, getUnitPositionTypes, getUnitServiceTypes, DEFAULT_POSITION_TYPES, DEFAULT_SERVICE_TYPES } = require("../database");
const { requireRole } = require("../middleware");

router.get("/constants", (req, res) => {
  res.json({
    positionTypes: getUnitPositionTypes(req.unit),
    serviceTypes: getUnitServiceTypes(req.unit),
  });
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

router.get("/position-types", (req, res) => {
  res.json(getUnitPositionTypes(req.unit));
});

router.put("/position-types", requireRole("owner"), async (req, res) => {
  const { position_types } = req.body;
  if (!position_types || typeof position_types !== "object") {
    return res.status(400).json({ error: "position_types object required" });
  }
  await Unit.findByIdAndUpdate(req.unit._id, { position_types });
  res.json({ success: true });
});

router.post("/position-types/reset", requireRole("owner"), async (req, res) => {
  await Unit.findByIdAndUpdate(req.unit._id, { position_types: null });
  res.json({ success: true, position_types: DEFAULT_POSITION_TYPES });
});

router.get("/service-types", (req, res) => {
  res.json(getUnitServiceTypes(req.unit));
});

router.put("/service-types", requireRole("owner"), async (req, res) => {
  const { service_types } = req.body;
  if (!service_types || typeof service_types !== "object") {
    return res.status(400).json({ error: "service_types object required" });
  }
  await Unit.findByIdAndUpdate(req.unit._id, { service_types });
  res.json({ success: true });
});

router.post("/service-types/reset", requireRole("owner"), async (req, res) => {
  await Unit.findByIdAndUpdate(req.unit._id, { service_types: null });
  res.json({ success: true, service_types: DEFAULT_SERVICE_TYPES });
});

module.exports = router;
