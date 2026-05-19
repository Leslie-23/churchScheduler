const mongoose = require("mongoose");
const crypto = require("crypto");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/churchscheduler";

const POSITION_TYPES = {
  DOOR: { label: "Door", description: "Entry/exit management", requiresSuit: false, requiresMale: false },
  STANDING: { label: "Standing", description: "Visible hall positions", requiresSuit: true, requiresMale: false },
  USHER: { label: "Usher", description: "Guiding people to seats", requiresSuit: false, requiresMale: false },
  OVERFLOW: { label: "Overflow / Parking", description: "Overflow areas and parking", requiresSuit: false, requiresMale: false },
  ESCORT: { label: "Preacher Escort", description: "Escorting and guarding the preacher", requiresSuit: true, requiresMale: true },
  CHAIRS: { label: "Chair Arrangement", description: "Setting up and arranging chairs", requiresSuit: false, requiresMale: true },
};

const SERVICE_TYPES = {
  sunday: "Sunday Service",
  wednesday: "Wednesday Service",
  special: "Special Service",
};

const VALID_POSITIONS = Object.keys(POSITION_TYPES);

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
  skills: [{
    position_type: { type: String, enum: VALID_POSITIONS },
    rating: { type: Number, min: 1, max: 5, default: 3 },
  }],
}, { timestamps: true });

const serviceSchema = new mongoose.Schema({
  unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true, index: true },
  date: { type: String, required: true },
  service_type: { type: String, required: true, enum: Object.keys(SERVICE_TYPES) },
  name: { type: String, default: "" },
  status: { type: String, enum: ["draft", "published"], default: "draft" },
}, { timestamps: true });

const assignmentSchema = new mongoose.Schema({
  service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
  position_type: { type: String, required: true, enum: VALID_POSITIONS },
});
assignmentSchema.index({ service: 1, member: 1 }, { unique: true });

const unavailabilitySchema = new mongoose.Schema({
  unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true, index: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
  date: { type: String, required: true },
  reason: { type: String, default: "" },
});
unavailabilitySchema.index({ member: 1, date: 1 }, { unique: true });

const positionCountSchema = new mongoose.Schema({
  unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
  service_type: { type: String, required: true, enum: Object.keys(SERVICE_TYPES) },
  position_type: { type: String, required: true, enum: VALID_POSITIONS },
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
const PositionCount = mongoose.model("PositionCount", positionCountSchema);

// --- Init ---

async function connectDb() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");
}

async function seedPositionCounts(unitId) {
  const defaults = [
    ["sunday", "DOOR", 4], ["sunday", "STANDING", 4], ["sunday", "USHER", 3],
    ["sunday", "OVERFLOW", 2], ["sunday", "ESCORT", 2], ["sunday", "CHAIRS", 4],
    ["wednesday", "DOOR", 2], ["wednesday", "STANDING", 2], ["wednesday", "USHER", 2],
    ["wednesday", "OVERFLOW", 1], ["wednesday", "ESCORT", 2], ["wednesday", "CHAIRS", 3],
    ["special", "DOOR", 4], ["special", "STANDING", 4], ["special", "USHER", 3],
    ["special", "OVERFLOW", 2], ["special", "ESCORT", 2], ["special", "CHAIRS", 4],
  ];

  await PositionCount.insertMany(
    defaults.map(([service_type, position_type, count]) => ({
      unit: unitId, service_type, position_type, count,
    }))
  );
}

module.exports = {
  connectDb,
  seedPositionCounts,
  User,
  Unit,
  UnitMembership,
  Member,
  Service,
  Assignment,
  Unavailability,
  PositionCount,
  POSITION_TYPES,
  SERVICE_TYPES,
};
