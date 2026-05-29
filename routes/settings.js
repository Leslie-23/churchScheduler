const router = require("express").Router();
const { PositionCount, Unit, getUnitPositionTypes, getUnitServiceTypes, DEFAULT_POSITION_TYPES, DEFAULT_SERVICE_TYPES } = require("../database");
const { requireRole } = require("../middleware");

function isPlainConfigObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function hasSafeKey(key, pattern) {
  return pattern.test(key) && !["__proto__", "prototype", "constructor"].includes(key);
}

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
  if (!Array.isArray(counts)) return res.status(400).json({ error: "counts array required" });
  if (!getUnitServiceTypes(req.unit)[req.params.serviceType]) {
    return res.status(400).json({ error: "Invalid service type" });
  }
  const positionTypes = getUnitPositionTypes(req.unit);
  for (const c of counts) {
    if (!positionTypes[c.position_type]) return res.status(400).json({ error: "Invalid position type" });
    const count = Number(c.count);
    if (!Number.isInteger(count) || count < 0 || count > 100) {
      return res.status(400).json({ error: "Invalid position count" });
    }
    await PositionCount.findOneAndUpdate(
      { unit: req.unit._id, service_type: req.params.serviceType, position_type: c.position_type },
      { count },
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
  if (!isPlainConfigObject(position_types)) {
    return res.status(400).json({ error: "position_types object required" });
  }
  for (const [key, value] of Object.entries(position_types)) {
    if (!hasSafeKey(key, /^[A-Z0-9_]+$/) || !isPlainConfigObject(value) || !value.label) {
      return res.status(400).json({ error: "Invalid position type" });
    }
    value.label = String(value.label).trim();
    value.description = String(value.description || "").trim();
    value.requiresSuit = !!value.requiresSuit;
    value.requiresMale = !!value.requiresMale;
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
  if (!isPlainConfigObject(service_types)) {
    return res.status(400).json({ error: "service_types object required" });
  }
  for (const [key, label] of Object.entries(service_types)) {
    if (!hasSafeKey(key, /^[a-z0-9_]+$/) || !String(label).trim()) {
      return res.status(400).json({ error: "Invalid service type" });
    }
    service_types[key] = String(label).trim();
  }
  await Unit.findByIdAndUpdate(req.unit._id, { service_types });
  res.json({ success: true });
});

router.post("/service-types/reset", requireRole("owner"), async (req, res) => {
  await Unit.findByIdAndUpdate(req.unit._id, { service_types: null });
  res.json({ success: true, service_types: DEFAULT_SERVICE_TYPES });
});

module.exports = router;
