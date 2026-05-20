const mongoose = require("mongoose");
const crypto = require("crypto");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/churchscheduler";

const DEFAULT_POSITION_TYPES = {
  DOOR: { label: "Door", description: "Entry/exit management", requiresSuit: false, requiresMale: false },
  STANDING: { label: "Standing", description: "Visible hall positions", requiresSuit: true, requiresMale: false },
  USHER: { label: "Usher", description: "Guiding people to seats", requiresSuit: false, requiresMale: false },
  OVERFLOW: { label: "Overflow / Parking", description: "Overflow areas and parking", requiresSuit: false, requiresMale: false },
  ESCORT: { label: "Preacher Escort", description: "Escorting and guarding the preacher", requiresSuit: true, requiresMale: true },
  CHAIRS: { label: "Chair Arrangement", description: "Setting up and arranging chairs", requiresSuit: false, requiresMale: true },
};

const DEFAULT_SERVICE_TYPES = {
  sunday: "Sunday Service",
  wednesday: "Wednesday Service",
  special: "Special Service",
};

// --- Auth Schemas ---

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String },
  google_id: { type: String, unique: true, sparse: true },
  phone: { type: String, trim: true, default: "" },
  gender: { type: String, enum: ["M", "F", ""], default: "" },
  avatar: { type: String, default: "" },
  notification_preferences: {
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    sms_number: { type: String, default: "" },
  },
}, { timestamps: true });

const unitSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  invite_code: { type: String, unique: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  position_types: { type: mongoose.Schema.Types.Mixed, default: null },
  service_types: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

unitSchema.pre("save", function (next) {
  if (!this.invite_code) {
    this.invite_code = crypto.randomBytes(4).toString("hex");
  }
  next();
});

const unitMembershipSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
  role: { type: String, enum: ["owner", "admin", "member"], default: "member" },
  member: { type: mongoose.Schema.Types.ObjectId, ref: "Member" },
}, { timestamps: true });
unitMembershipSchema.index({ user: 1, unit: 1 }, { unique: true });

// --- Existing Schemas (with unit field) ---

const memberSchema = new mongoose.Schema({
  unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true, index: true },
  name: { type: String, required: true, trim: true },
  gender: { type: String, required: true, enum: ["M", "F"] },
  has_suit: { type: Boolean, default: false },
  phone: { type: String, trim: true, default: "" },
  active: { type: Boolean, default: true },
  notes: { type: String, default: "" },
  service_availability: { type: String, enum: ["both", "first_only", "second_only"], default: "both" },
  skills: [{
    position_type: { type: String },
    rating: { type: Number, min: 1, max: 5, default: 3 },
  }],
}, { timestamps: true });

const serviceSchema = new mongoose.Schema({
  unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true, index: true },
  date: { type: String, required: true },
  service_type: { type: String, required: true },
  service_slot: { type: Number, enum: [1, 2], default: 1 },
  name: { type: String, default: "" },
  status: { type: String, enum: ["draft", "published"], default: "draft" },
}, { timestamps: true });

const assignmentSchema = new mongoose.Schema({
  service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
  position_type: { type: String, required: true },
  attendance: { type: String, enum: ["pending", "present", "absent", "excused"], default: "pending" },
});
assignmentSchema.index({ service: 1, member: 1 }, { unique: true });

const unavailabilitySchema = new mongoose.Schema({
  unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true, index: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
  date: { type: String, required: true },
  reason: { type: String, default: "" },
});
unavailabilitySchema.index({ member: 1, date: 1 }, { unique: true });

const joinRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
  status: { type: String, enum: ["pending", "approved", "denied"], default: "pending" },
}, { timestamps: true });
joinRequestSchema.index({ user: 1, unit: 1, status: 1 });

const positionCountSchema = new mongoose.Schema({
  unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
  service_type: { type: String, required: true },
  position_type: { type: String, required: true },
  count: { type: Number, default: 1, min: 0 },
});
positionCountSchema.index({ unit: 1, service_type: 1, position_type: 1 }, { unique: true });

// --- Models ---

const User = mongoose.model("User", userSchema);
const Unit = mongoose.model("Unit", unitSchema);
const UnitMembership = mongoose.model("UnitMembership", unitMembershipSchema);
const Member = mongoose.model("Member", memberSchema);
const Service = mongoose.model("Service", serviceSchema);
const Assignment = mongoose.model("Assignment", assignmentSchema);
const Unavailability = mongoose.model("Unavailability", unavailabilitySchema);
const JoinRequest = mongoose.model("JoinRequest", joinRequestSchema);
const PositionCount = mongoose.model("PositionCount", positionCountSchema);

// --- Init ---

async function connectDb() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");
}

function getUnitPositionTypes(unit) {
  return unit && unit.position_types ? unit.position_types : DEFAULT_POSITION_TYPES;
}

function getUnitServiceTypes(unit) {
  return unit && unit.service_types ? unit.service_types : DEFAULT_SERVICE_TYPES;
}

async function seedPositionCounts(unitId) {
  const unit = await Unit.findById(unitId).lean();
  const serviceTypes = getUnitServiceTypes(unit);
  const positionTypes = getUnitPositionTypes(unit);
  const defaults = [];
  for (const sType of Object.keys(serviceTypes)) {
    for (const pType of Object.keys(positionTypes)) {
      defaults.push({ unit: unitId, service_type: sType, position_type: pType, count: 2 });
    }
  }
  if (defaults.length > 0) {
    await PositionCount.insertMany(defaults, { ordered: false }).catch((err) => {
      if (err.code !== 11000) throw err;
    });
  }
}

module.exports = {
  connectDb,
  seedPositionCounts,
  getUnitPositionTypes,
  getUnitServiceTypes,
  User,
  Unit,
  UnitMembership,
  Member,
  Service,
  Assignment,
  Unavailability,
  JoinRequest,
  PositionCount,
  DEFAULT_POSITION_TYPES,
  DEFAULT_SERVICE_TYPES,
};
