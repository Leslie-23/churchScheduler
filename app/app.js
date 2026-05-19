let CONSTANTS = {};
let currentServiceId = null;
let replaceState = {};
let currentUser = null;
let currentMemberships = [];
let activeUnitId = null;
let activeRole = null;
const _busyOps = new Set();

const pageTitles = {
  dashboard: "Dashboard",
  members: "Members",
  schedule: "Schedule",
  settings: "Settings",
  sms: "SMS Notifications",
  reports: "AI Reports",
  profile: "Profile",
};

let aiHistory = [];

function toast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  const icons = {
    success: "&#10003;",
    error: "&#10007;",
    warning: "&#9888;",
    info: "&#8505;",
  };
  el.innerHTML = `<span>${icons[type] || ""}</span> ${esc(message)}`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add("toast-out");
    setTimeout(() => el.remove(), 200);
  }, duration);
}

function showLoading(text = "Loading...") {
  let overlay = document.getElementById("global-loading");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "global-loading";
    overlay.className = "loading-overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="loader"><span></span><span></span><span></span></div><div class="loading-text">${esc(text)}</div>`;
  overlay.style.display = "flex";
}

function hideLoading() {
  const overlay = document.getElementById("global-loading");
  if (overlay) overlay.style.display = "none";
}

function setBtnLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.classList.add("is-loading");
    btn.dataset.origText = btn.textContent;
  } else {
    btn.classList.remove("is-loading");
    if (btn.dataset.origText) btn.textContent = btn.dataset.origText;
  }
}

function isBusy(key) { return _busyOps.has(key); }
function markBusy(key) { _busyOps.add(key); }
function clearBusy(key) { _busyOps.delete(key); }

function getToken() {
  return localStorage.getItem("auth_token");
}

function getActiveUnitId() {
  return activeUnitId || localStorage.getItem("active_unit_id");
}

async function api(path, method = "GET", body = null) {
  const token = getToken();
  if (!token) {
    window.location.href = "/login.html";
    return;
  }
  const headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token,
  };
  const unitId = getActiveUnitId();
  if (unitId) headers["X-Unit-Id"] = unitId;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch("/api" + path, opts);
  if (res.status === 401) {
    localStorage.removeItem("auth_token");
    window.location.href = "/login.html";
    return;
  }
  if (res.status === 403) {
    const data = await res.json();
    toast(data.error || "You don't have permission for this action.", "error");
    return null;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    toast(data.error || "Something went wrong.", "error");
    return null;
  }
  return res.json();
}

document.addEventListener("DOMContentLoaded", async () => {
  const token = getToken();
  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  const meData = await api("/auth/me");
  if (!meData) return;

  currentUser = meData.user;
  currentMemberships = meData.memberships;

  if (currentMemberships.length === 0) {
    window.location.href = "/onboarding.html";
    return;
  }

  const savedUnit = localStorage.getItem("active_unit_id");
  const validSaved = currentMemberships.find((m) => m.unit._id === savedUnit);
  if (validSaved) {
    activeUnitId = savedUnit;
    activeRole = validSaved.role;
  } else {
    activeUnitId = currentMemberships[0].unit._id;
    activeRole = currentMemberships[0].role;
    localStorage.setItem("active_unit_id", activeUnitId);
  }

  populateUnitSwitcher();
  renderUserInfo();
  applyRoleRestrictions(activeRole);

  CONSTANTS = await api("/constants");
  setupNav();
  setupSuitToggle();
  populateServiceTypeSelects();
  loadDashboard();
  loadMembers();
  loadServices();
  if (activeRole !== "member") loadSettings();
  checkAIStatus();
  if (activeRole !== "member") checkSMSStatus();

  document.getElementById("sms-service").addEventListener("change", updateSMSPreview);
  document.getElementById("sms-broadcast-msg").addEventListener("input", () => {
    const len = document.getElementById("sms-broadcast-msg").value.length;
    document.getElementById("sms-char-count").textContent = `${len} / 160 chars`;
  });

  const today = new Date().toISOString().split("T")[0];
  document.getElementById("quick-date").value = today;
  document.getElementById("s-date").value = today;
});

function populateUnitSwitcher() {
  const sel = document.getElementById("unit-switcher");
  sel.innerHTML = currentMemberships.map((m) =>
    `<option value="${m.unit._id}" ${m.unit._id === activeUnitId ? "selected" : ""}>${esc(m.unit.name)}</option>`
  ).join("");
  sel.style.display = currentMemberships.length > 1 ? "" : "none";
}

function switchUnit(unitId) {
  activeUnitId = unitId;
  localStorage.setItem("active_unit_id", unitId);
  const membership = currentMemberships.find((m) => m.unit._id === unitId);
  activeRole = membership ? membership.role : "member";
  applyRoleRestrictions(activeRole);
  loadDashboard();
  loadMembers();
  loadServices();
  if (activeRole !== "member") loadSettings();
  currentServiceId = null;
  document.getElementById("schedule-detail").style.display = "none";
}

function renderUserInfo() {
  const el = document.getElementById("sidebar-user");
  el.style.display = "";
  document.getElementById("sidebar-user-name").textContent = currentUser.name;
}

function applyRoleRestrictions(role) {
  const hierarchy = { owner: 3, admin: 2, member: 1 };
  const userLevel = hierarchy[role] || 1;

  document.querySelectorAll("[data-min-role]").forEach((el) => {
    const required = hierarchy[el.dataset.minRole] || 1;
    el.style.display = userLevel >= required ? "" : "none";
  });
}

function logout() {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("active_unit_id");
  window.location.href = "/";
}

function showPage(page) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
  const el = document.getElementById("page-" + page);
  if (el) el.classList.add("active");
  const nav = document.querySelector(`[data-page="${page}"]`);
  if (nav) nav.classList.add("active");
  document.getElementById("page-title").textContent = pageTitles[page] || page;
  closeSidebar();
  if (page === "profile") loadProfile();
  if (page === "sms") { checkSMSStatus(); }
}

function setupNav() {
  document.querySelectorAll(".nav-link").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const page = a.dataset.page;
      showPage(page);
      if (page === "dashboard") loadDashboard();
    });
  });
}

// --- Dashboard ---

async function loadDashboard() {
  const upEl = document.getElementById("upcoming-services");
  upEl.innerHTML = '<div class="loading-spinner">Loading upcoming...</div>';
  document.getElementById("stats-row").innerHTML = `
    <div class="card stat-card"><div class="loading-spinner" style="padding:1rem"></div></div>
    <div class="card stat-card"><div class="loading-spinner" style="padding:1rem"></div></div>
    <div class="card stat-card"><div class="loading-spinner" style="padding:1rem"></div></div>
    <div class="card stat-card"><div class="loading-spinner" style="padding:1rem"></div></div>
  `;

  const [members, services] = await Promise.all([
    api("/members"),
    api("/services?upcoming=true"),
  ]);
  if (!members || !services) return;

  const total = members.length;
  const active = members.filter((m) => m.active);
  const males = active.filter((m) => m.gender === "M");
  const females = active.filter((m) => m.gender === "F");
  const withSuit = active.filter((m) => m.has_suit);

  document.getElementById("stats-row").innerHTML = `
    <div class="card stat-card">
      <div class="number">${total}</div>
      <div class="label">Total Members</div>
      <div class="stat-sub">${males.length}M &middot; ${females.length}F</div>
    </div>
    <div class="card stat-card">
      <div class="number">${active.length}</div>
      <div class="label">Active</div>
      <div class="stat-sub">${total - active.length} inactive</div>
    </div>
    <div class="card stat-card">
      <div class="number">${withSuit.length}</div>
      <div class="label">With Suits</div>
      <div class="stat-sub">${active.length - withSuit.length} without</div>
    </div>
    <div class="card stat-card">
      <div class="number">${services.length}</div>
      <div class="label">Upcoming</div>
      <div class="stat-sub">services scheduled</div>
    </div>
  `;

  if (services.length === 0) {
    upEl.innerHTML = '<div class="empty-state"><p>No upcoming services.</p></div>';
  } else {
    upEl.innerHTML = services
      .slice(0, 5)
      .map((s) => {
        const d = new Date(s.date + "T00:00:00");
        const day = d.getDate();
        const month = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
        return `
          <div class="upcoming-item" style="cursor:pointer" onclick="goToService('${s._id}')">
            <div class="upcoming-date">
              <span class="day">${day}</span>
              <span class="month">${month}</span>
            </div>
            <div class="upcoming-info">
              <div class="title">${CONSTANTS.serviceTypes[s.service_type] || s.service_type}</div>
              <div class="subtitle">${s.name ? esc(s.name) : formatDate(s.date)}</div>
            </div>
            <span class="badge badge-${s.status}" style="margin-left:auto">${s.status}</span>
          </div>
        `;
      })
      .join("");
  }
}

function goToService(id) {
  showPage("schedule");
  loadServices().then(() => viewSchedule(id));
}

// --- Members (expandable rows) ---

let membersCache = [];

async function loadMembers() {
  membersCache = await api("/members");
  if (!membersCache) return;
  const tbody = document.getElementById("members-table");
  const empty = document.getElementById("members-empty");

  if (membersCache.length === 0) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const isAdmin = activeRole === "owner" || activeRole === "admin";

  tbody.innerHTML = membersCache
    .map(
      (m) => `
    <tr class="expandable-row" onclick="toggleMemberDetail('${m._id}', this)">
      <td data-label="">
        <div style="display:flex; align-items:center; gap:0.65rem">
          <span class="expand-arrow">&#9654;</span>
          <div class="assignment-avatar">${getInitials(m.name)}</div>
          <strong>${esc(m.name)}</strong>
        </div>
      </td>
      <td data-label="Gender"><span class="badge badge-${m.gender === "M" ? "male" : "female"}">${m.gender === "M" ? "M" : "F"}</span></td>
      <td data-label="Suit">${m.has_suit ? '<span class="badge badge-suit">Suit</span>' : '<span style="color:var(--gray-400)">&mdash;</span>'}</td>
      <td data-label="Phone" style="color:var(--gray-600); font-size:0.82rem">${esc(m.phone || "—")}</td>
      <td data-label="Status"><span class="badge badge-${m.active ? "active" : "inactive"}">${m.active ? "Active" : "Off"}</span></td>
      <td data-label="" onclick="event.stopPropagation()">
        ${isAdmin ? `<div class="btn-group">
          <button class="btn btn-outline btn-sm" onclick="editMember('${m._id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMember('${m._id}', '${esc(m.name)}')">Del</button>
        </div>` : ""}
      </td>
    </tr>
    <tr class="expand-detail" id="detail-${m._id}">
      <td colspan="6">
        <div class="expand-content" id="detail-content-${m._id}">
          <div class="loading-spinner">Loading...</div>
        </div>
      </td>
    </tr>
  `
    )
    .join("");
}

async function toggleMemberDetail(id, rowEl) {
  const detailRow = document.getElementById("detail-" + id);
  const isOpen = detailRow.classList.contains("active");

  document.querySelectorAll(".expand-detail.active").forEach((r) => r.classList.remove("active"));
  document.querySelectorAll(".expandable-row.expanded").forEach((r) => r.classList.remove("expanded"));

  if (isOpen) return;

  rowEl.classList.add("expanded");
  detailRow.classList.add("active");

  const content = document.getElementById("detail-content-" + id);
  const [skills, history] = await Promise.all([
    api(`/members/${id}/skills`),
    api(`/members/${id}/history`),
  ]);

  const member = membersCache.find((m) => m._id === id);
  const skillMap = {};
  if (skills) skills.forEach((s) => (skillMap[s.position_type] = s.rating));

  const skillsHtml = Object.entries(CONSTANTS.positionTypes)
    .map(([key, pos]) => {
      const r = skillMap[key] || 3;
      return `<span class="mini-skill">${pos.label} <span class="dots">${"●".repeat(r)}</span><span class="dots-empty">${"●".repeat(5 - r)}</span></span>`;
    })
    .join("");

  const historyHtml = history && history.length
    ? history
        .map(
          (h) =>
            `<div class="history-item"><strong>${formatDateShort(h.date)}</strong> ${CONSTANTS.positionTypes[h.position_type]?.label || h.position_type} — ${CONSTANTS.serviceTypes[h.service_type] || h.service_type}</div>`
        )
        .join("")
    : '<span style="color:var(--gray-400); font-size:0.78rem">No history yet</span>';

  content.innerHTML = `
    <div class="detail-grid">
      <div class="detail-section">
        <h5>Skills</h5>
        <div class="mini-skills">${skillsHtml}</div>
      </div>
      <div class="detail-section">
        <h5>Notes</h5>
        <p>${member && member.notes ? esc(member.notes) : '<span style="color:var(--gray-400)">No notes</span>'}</p>
      </div>
      <div class="detail-section" style="grid-column: 1 / -1">
        <h5>Recent Assignments</h5>
        <div class="history-list">${historyHtml}</div>
      </div>
    </div>
  `;
}

function openMemberModal() {
  document.getElementById("member-edit-id").value = "";
  document.getElementById("member-modal-title").textContent = "Add Member";
  document.getElementById("m-name").value = "";
  document.getElementById("m-phone").value = "";
  document.getElementById("m-gender").value = "M";
  document.getElementById("m-suit").checked = false;
  document.getElementById("m-suit-label").textContent = "No";
  document.getElementById("m-notes").value = "";
  renderSkillInputs({});
  document.getElementById("member-modal").classList.add("active");
}

function closeMemberModal() {
  document.getElementById("member-modal").classList.remove("active");
}

async function editMember(id) {
  const member = membersCache.find((m) => m._id === id) || (await api("/members")).find((m) => m._id === id);
  const skills = await api(`/members/${id}/skills`);
  if (!member) return;

  document.getElementById("member-edit-id").value = id;
  document.getElementById("member-modal-title").textContent = "Edit Member";
  document.getElementById("m-name").value = member.name;
  document.getElementById("m-phone").value = member.phone || "";
  document.getElementById("m-gender").value = member.gender;
  document.getElementById("m-suit").checked = !!member.has_suit;
  document.getElementById("m-suit-label").textContent = member.has_suit ? "Yes" : "No";
  document.getElementById("m-notes").value = member.notes || "";

  const skillMap = {};
  if (skills) skills.forEach((s) => (skillMap[s.position_type] = s.rating));
  renderSkillInputs(skillMap);

  document.getElementById("member-modal").classList.add("active");
}

function renderSkillInputs(skillMap) {
  const container = document.getElementById("skill-ratings");
  container.innerHTML = Object.entries(CONSTANTS.positionTypes)
    .map(([key, pos]) => {
      const rating = skillMap[key] || 3;
      return `
      <div class="skill-row">
        <div class="skill-label">
          <strong>${pos.label}</strong>
          <span>${pos.description}</span>
        </div>
        <div class="stars" data-position="${key}">
          ${[1, 2, 3, 4, 5]
            .map(
              (i) =>
                `<span class="${i <= rating ? "filled" : ""}" data-value="${i}" onclick="setRating(this)">&#9733;</span>`
            )
            .join("")}
        </div>
      </div>
    `;
    })
    .join("");
}

function setRating(starEl) {
  const value = parseInt(starEl.dataset.value);
  starEl.parentElement.querySelectorAll("span").forEach((s) => {
    s.classList.toggle("filled", parseInt(s.dataset.value) <= value);
  });
}

async function saveMember() {
  const id = document.getElementById("member-edit-id").value;
  const data = {
    name: document.getElementById("m-name").value.trim(),
    gender: document.getElementById("m-gender").value,
    has_suit: document.getElementById("m-suit").checked,
    phone: document.getElementById("m-phone").value.trim(),
    notes: document.getElementById("m-notes").value.trim(),
    active: true,
  };

  if (!data.name) return toast("Name is required", "warning");

  const btn = document.querySelector("#member-modal .modal-footer .btn-primary");
  setBtnLoading(btn, true);

  try {
    let memberId;
    if (id) {
      const existing = membersCache.find((m) => m._id === id);
      data.active = existing ? existing.active : true;
      const result = await api(`/members/${id}`, "PUT", data);
      if (!result) return;
      memberId = id;
    } else {
      const result = await api("/members", "POST", data);
      if (!result) return;
      memberId = result._id;
    }

    const skills = [];
    document.querySelectorAll("#skill-ratings .stars").forEach((starGroup) => {
      const filled = starGroup.querySelectorAll(".filled").length;
      skills.push({ position_type: starGroup.dataset.position, rating: filled || 1 });
    });
    await api(`/members/${memberId}/skills`, "PUT", { skills });

    closeMemberModal();
    toast(id ? "Member updated" : "Member added", "success");
    loadMembers();
    loadDashboard();
  } finally {
    setBtnLoading(btn, false);
  }
}

async function deleteMember(id, name) {
  if (!confirm(`Delete ${name}?`)) return;
  const result = await api(`/members/${id}`, "DELETE");
  if (result) toast(`${name} removed`, "success");
  loadMembers();
  loadDashboard();
}

function setupSuitToggle() {
  const cb = document.getElementById("m-suit");
  const label = document.getElementById("m-suit-label");
  cb.addEventListener("change", () => { label.textContent = cb.checked ? "Yes" : "No"; });
}

// --- Services (clickable rows) ---

async function loadServices() {
  const services = await api("/services");
  if (!services) return;
  const tbody = document.getElementById("services-table");
  const empty = document.getElementById("services-empty");

  if (services.length === 0) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const isAdmin = activeRole === "owner" || activeRole === "admin";

  tbody.innerHTML = services
    .map(
      (s) => `
    <tr class="expandable-row" onclick="viewSchedule('${s._id}')" style="cursor:pointer">
      <td data-label="Date"><strong>${formatDate(s.date)}</strong></td>
      <td data-label="Type">${CONSTANTS.serviceTypes[s.service_type] || s.service_type}</td>
      <td data-label="Name" style="color:var(--gray-600)">${esc(s.name || "—")}</td>
      <td data-label="Status"><span class="badge badge-${s.status}">${s.status}</span></td>
      <td data-label="" onclick="event.stopPropagation()">
        <div class="btn-group">
          <button class="btn btn-outline btn-sm" onclick="viewSchedule('${s._id}')">View</button>
          ${isAdmin ? `<button class="btn btn-danger btn-sm" onclick="deleteService('${s._id}')">Del</button>` : ""}
        </div>
      </td>
    </tr>
  `
    )
    .join("");
}

function openServiceModal() { document.getElementById("service-modal").classList.add("active"); }
function closeServiceModal() { document.getElementById("service-modal").classList.remove("active"); }

async function saveService() {
  const data = {
    date: document.getElementById("s-date").value,
    service_type: document.getElementById("s-type").value,
    name: document.getElementById("s-name").value.trim(),
  };
  if (!data.date || !data.service_type) return toast("Date and type are required", "warning");

  const btn = document.querySelector("#service-modal .modal-footer .btn-primary");
  setBtnLoading(btn, true);
  try {
    const result = await api("/services", "POST", data);
    if (!result) return;
    closeServiceModal();
    toast("Service created", "success");
    loadServices();
    loadDashboard();
  } finally {
    setBtnLoading(btn, false);
  }
}

async function deleteService(id) {
  if (!confirm("Delete this service and all its assignments?")) return;
  const result = await api(`/services/${id}`, "DELETE");
  if (result) toast("Service deleted", "success");
  currentServiceId = null;
  document.getElementById("schedule-detail").style.display = "none";
  loadServices();
  loadDashboard();
}

// --- Schedule ---

async function viewSchedule(serviceId) {
  currentServiceId = serviceId;
  const services = await api("/services");
  if (!services) return;
  const service = services.find((s) => s._id === serviceId);
  if (!service) return;

  const detail = document.getElementById("schedule-detail");
  detail.style.display = "block";
  document.getElementById("schedule-detail-title").textContent =
    `${formatDate(service.date)} — ${CONSTANTS.serviceTypes[service.service_type] || service.service_type}${service.name ? " — " + service.name : ""}`;

  const publishBtn = document.getElementById("btn-publish");
  if (service.status === "published") {
    publishBtn.textContent = "Unpublish";
    publishBtn.className = "btn btn-ghost btn-sm";
  } else {
    publishBtn.textContent = "Publish";
    publishBtn.className = "btn btn-primary btn-sm";
  }

  const notifyBtn = document.getElementById("btn-notify-sms");
  if (notifyBtn) {
    const smsStatus = await api("/sms/status").catch(() => null);
    notifyBtn.style.display = smsStatus && smsStatus.enabled ? "" : "none";
  }

  await loadAssignments(serviceId);
  detail.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function notifyCurrentService(btn) {
  if (!currentServiceId) return;
  if (!confirm("Send SMS notifications to all assigned members?")) return;
  setBtnLoading(btn, true);
  try {
    const result = await api("/sms/notify-service", "POST", { service_id: currentServiceId });
    if (result) toast(`${result.sent} notifications sent, ${result.skipped} skipped, ${result.failed} failed`, result.failed ? "warning" : "success");
  } finally {
    setBtnLoading(btn, false);
  }
}

async function loadAssignments(serviceId) {
  const assignments = await api(`/services/${serviceId}/assignments`);
  if (!assignments) return;
  const container = document.getElementById("schedule-assignments");
  const empty = document.getElementById("schedule-empty");
  document.getElementById("schedule-warnings").innerHTML = "";

  if (assignments.length === 0) {
    container.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const isAdmin = activeRole === "owner" || activeRole === "admin";

  const grouped = {};
  for (const a of assignments) {
    if (!grouped[a.position_type]) grouped[a.position_type] = [];
    grouped[a.position_type].push(a);
  }

  const posOrder = ["ESCORT", "STANDING", "DOOR", "USHER", "OVERFLOW", "CHAIRS"];
  container.innerHTML = posOrder
    .filter((p) => grouped[p])
    .map(
      (p) => `
    <div class="position-group">
      <div class="position-group-header">
        <h4>${CONSTANTS.positionTypes[p]?.label || p}</h4>
        <span class="count">${grouped[p].length}</span>
      </div>
      ${grouped[p]
        .map(
          (a) => `
        <div class="assignment-item">
          <div class="assignment-name">
            <div class="assignment-avatar">${getInitials(a.member_name)}</div>
            <div>
              <strong style="font-size:0.88rem">${esc(a.member_name)}</strong>
              ${a.has_suit ? ' <span class="badge badge-suit" style="font-size:0.6rem">Suit</span>' : ""}
            </div>
          </div>
          ${isAdmin ? `<div class="btn-group">
            <button class="btn btn-outline btn-sm" onclick="openReplaceModal('${a._id}', '${a.position_type}', '${a.member}', '${esc(a.member_name)}')">Can't Make It</button>
            <button class="btn btn-outline btn-sm" onclick="openSwapModal('${a._id}', '${a.position_type}', '${a.member}')">Swap</button>
            <button class="btn btn-danger btn-sm" onclick="removeAssignment('${a._id}')">X</button>
          </div>` : ""}
        </div>
      `
        )
        .join("")}
    </div>
  `
    )
    .join("");
}

async function generateCurrentSchedule(btn) {
  if (!currentServiceId) return;
  if (isBusy("generate")) return toast("Schedule generation in progress...", "warning");
  markBusy("generate");

  showLoading("Generating schedule...");
  if (btn) setBtnLoading(btn, true);

  try {
    const result = await api(`/services/${currentServiceId}/generate`, "POST");
    if (!result) return;
    if (result.warnings && result.warnings.length > 0) {
      document.getElementById("schedule-warnings").innerHTML =
        `<div class="alert alert-warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          ${result.warnings.join("; ")}
        </div>`;
      toast("Schedule generated with warnings", "warning");
    } else {
      toast(`Schedule generated — ${result.assignments.length} assigned`, "success");
    }
    await loadAssignments(currentServiceId);
  } finally {
    hideLoading();
    if (btn) setBtnLoading(btn, false);
    clearBusy("generate");
  }
}

async function regenerateSchedule(btn) {
  if (!confirm("Replace current schedule with a new one?")) return;
  await generateCurrentSchedule(btn);
}

async function publishSchedule() {
  if (!currentServiceId) return;
  const services = await api("/services");
  if (!services) return;
  const service = services.find((s) => s._id === currentServiceId);
  const newStatus = service.status === "published" ? "draft" : "published";
  const btn = document.getElementById("btn-publish");
  setBtnLoading(btn, true);
  try {
    await api(`/services/${currentServiceId}/status`, "PUT", { status: newStatus });
    toast(newStatus === "published" ? "Schedule published" : "Schedule unpublished", "success");
    viewSchedule(currentServiceId);
    loadServices();
  } finally {
    setBtnLoading(btn, false);
  }
}

// --- Smart Replacement ---

async function openReplaceModal(assignmentId, positionType, memberId, memberName) {
  replaceState = { assignmentId, positionType, memberId, memberName, selectedId: null };

  document.getElementById("replace-removed").innerHTML = `
    <div class="removed-member">
      <div class="assignment-avatar">${getInitials(memberName)}</div>
      <div class="info">
        <strong>${esc(memberName)}</strong>
        <span>Removing from ${CONSTANTS.positionTypes[positionType]?.label || positionType} — will be marked unavailable</span>
      </div>
    </div>
  `;

  document.getElementById("replace-suggestions").innerHTML = '<div class="loading-spinner">Finding best replacements...</div>';
  document.getElementById("btn-confirm-replace").disabled = true;
  document.getElementById("replace-modal").classList.add("active");

  const result = await api(`/services/${currentServiceId}/suggest-replacement`, "POST", {
    position_type: positionType,
    remove_member_id: memberId,
  });

  if (!result || !result.suggestions || result.suggestions.length === 0) {
    document.getElementById("replace-suggestions").innerHTML =
      '<div class="empty-state" style="padding:1.5rem"><p>No eligible replacements found.</p></div>';
    return;
  }

  document.getElementById("replace-suggestions").innerHTML = `
    <div class="suggestion-list">
      ${result.suggestions
        .map(
          (s, i) => `
        <div class="suggestion-item" onclick="selectReplacement('${s.member._id}', this)" data-member-id="${s.member._id}">
          <span class="suggestion-rank">${i + 1}</span>
          <div class="assignment-avatar">${getInitials(s.member.name)}</div>
          <div class="suggestion-info">
            <div class="name">
              ${esc(s.member.name)}
              ${s.member.has_suit ? '<span class="badge badge-suit" style="font-size:0.55rem">Suit</span>' : ""}
              <span class="badge badge-${s.member.gender === "M" ? "male" : "female"}" style="font-size:0.55rem">${s.member.gender === "M" ? "M" : "F"}</span>
            </div>
            <div class="suggestion-reasons">${s.reasons.join(" · ")}</div>
          </div>
          <div class="suggestion-score">${s.score}</div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function selectReplacement(memberId, el) {
  document.querySelectorAll(".suggestion-item.selected").forEach((s) => s.classList.remove("selected"));
  el.classList.add("selected");
  replaceState.selectedId = memberId;
  document.getElementById("btn-confirm-replace").disabled = false;
}

async function confirmReplace() {
  if (!replaceState.selectedId) return;
  const btn = document.getElementById("btn-confirm-replace");
  setBtnLoading(btn, true);

  try {
    const services = await api("/services");
    if (!services) return;
    const service = services.find((s) => s._id === currentServiceId);

    const result = await api(`/services/${currentServiceId}/replace`, "POST", {
      assignment_id: replaceState.assignmentId,
      new_member_id: replaceState.selectedId,
      old_member_id: replaceState.memberId,
      date: service.date,
    });

    if (result) toast("Replacement confirmed", "success");
    closeReplaceModal();
    await loadAssignments(currentServiceId);
  } finally {
    setBtnLoading(btn, false);
  }
}

function closeReplaceModal() {
  document.getElementById("replace-modal").classList.remove("active");
  replaceState = {};
}

// --- Swap (with search select) ---

let swapMembersList = [];

async function openSwapModal(assignmentId, positionType, currentMemberId) {
  document.getElementById("swap-assignment-id").value = assignmentId;
  const members = await api("/members");
  if (!members) return;
  swapMembersList = members.filter((m) => m.active);

  document.getElementById("swap-position").innerHTML = Object.entries(CONSTANTS.positionTypes)
    .map(([key, pos]) => `<option value="${key}" ${key === positionType ? "selected" : ""}>${pos.label}</option>`)
    .join("");

  const current = swapMembersList.find((m) => m._id === currentMemberId);
  document.getElementById("swap-member").value = currentMemberId;
  document.getElementById("swap-member-input").value = current ? current.name : "";
  renderSwapDropdown(swapMembersList, currentMemberId);

  document.getElementById("swap-modal").classList.add("active");
}

function renderSwapDropdown(list, selectedId) {
  const dropdown = document.getElementById("swap-member-dropdown");
  if (list.length === 0) {
    dropdown.innerHTML = '<div class="search-no-results">No members found</div>';
    return;
  }
  dropdown.innerHTML = list
    .map(
      (m) => `
    <div class="search-option ${m._id === selectedId ? "selected" : ""}" onclick="selectSwapMember('${m._id}', '${esc(m.name)}')">
      <div class="search-avatar">${getInitials(m.name)}</div>
      <strong>${esc(m.name)}</strong>
      ${m.has_suit ? '<span class="badge badge-suit" style="font-size:0.55rem">Suit</span>' : ""}
      <span class="search-meta">${m.gender === "M" ? "M" : "F"}</span>
    </div>
  `
    )
    .join("");
}

function filterSwapMembers() {
  const query = document.getElementById("swap-member-input").value.toLowerCase();
  const filtered = swapMembersList.filter((m) => m.name.toLowerCase().includes(query));
  renderSwapDropdown(filtered, document.getElementById("swap-member").value);
  document.getElementById("swap-member-dropdown").classList.add("active");
}

function showSwapDropdown() {
  const query = document.getElementById("swap-member-input").value.toLowerCase();
  const filtered = query ? swapMembersList.filter((m) => m.name.toLowerCase().includes(query)) : swapMembersList;
  renderSwapDropdown(filtered, document.getElementById("swap-member").value);
  document.getElementById("swap-member-dropdown").classList.add("active");
}

function selectSwapMember(id, name) {
  document.getElementById("swap-member").value = id;
  document.getElementById("swap-member-input").value = name;
  document.getElementById("swap-member-dropdown").classList.remove("active");
}

function closeSwapModal() {
  document.getElementById("swap-modal").classList.remove("active");
  document.getElementById("swap-member-dropdown").classList.remove("active");
}

async function saveSwap() {
  const id = document.getElementById("swap-assignment-id").value;
  const memberId = document.getElementById("swap-member").value;
  if (!memberId) return toast("Select a member", "warning");
  const btn = document.querySelector("#swap-modal .modal-footer .btn-primary");
  setBtnLoading(btn, true);
  try {
    const result = await api(`/services/assignments/${id}`, "PUT", {
      member_id: memberId,
      position_type: document.getElementById("swap-position").value,
    });
    if (result) toast("Assignment swapped", "success");
    closeSwapModal();
    loadAssignments(currentServiceId);
  } finally {
    setBtnLoading(btn, false);
  }
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("#swap-member-search")) {
    document.getElementById("swap-member-dropdown")?.classList.remove("active");
  }
});

async function removeAssignment(id) {
  const result = await api(`/services/assignments/${id}`, "DELETE");
  if (result) toast("Assignment removed", "success");
  loadAssignments(currentServiceId);
}

// --- Quick Generate ---

async function quickGenerate() {
  const date = document.getElementById("quick-date").value;
  const type = document.getElementById("quick-type").value;
  const name = document.getElementById("quick-name").value.trim();
  if (!date || !type) return toast("Date and type are required", "warning");
  if (isBusy("quickgen")) return toast("Already generating...", "warning");
  markBusy("quickgen");

  showLoading("Creating service & generating schedule...");
  try {
    const service = await api("/services", "POST", { date, service_type: type, name });
    if (!service) return;
    await api(`/services/${service._id}/generate`, "POST");

    toast("Schedule created", "success");
    showPage("schedule");
    await loadServices();
    viewSchedule(service._id);
  } finally {
    hideLoading();
    clearBusy("quickgen");
  }
}

// --- Settings ---

async function loadSettings() {
  const editor = document.getElementById("position-counts-editor");
  editor.innerHTML = '<div class="loading-spinner">Loading settings...</div>';

  let html = "";
  for (const [sType, sLabel] of Object.entries(CONSTANTS.serviceTypes)) {
    const counts = await api(`/settings/position-counts/${sType}`);
    if (!counts) continue;
    html += `<div class="settings-section"><h3>${sLabel}</h3><div class="grid grid-3">`;
    for (const [pType, pos] of Object.entries(CONSTANTS.positionTypes)) {
      const existing = counts.find((c) => c.position_type === pType);
      html += `
        <div class="form-group">
          <label class="form-label">${pos.label}</label>
          <input type="number" min="0" max="20" value="${existing ? existing.count : 0}" class="form-input pc-input" data-service="${sType}" data-position="${pType}">
        </div>`;
    }
    html += "</div></div>";
  }
  editor.innerHTML = html;
}

async function savePositionCounts() {
  const btn = document.querySelector("#page-settings .card-header .btn-primary");
  setBtnLoading(btn, true);
  try {
    const byService = {};
    document.querySelectorAll(".pc-input").forEach((inp) => {
      const sType = inp.dataset.service;
      if (!byService[sType]) byService[sType] = [];
      byService[sType].push({ position_type: inp.dataset.position, count: parseInt(inp.value) || 0 });
    });
    for (const [sType, counts] of Object.entries(byService)) {
      await api(`/settings/position-counts/${sType}`, "PUT", { counts });
    }
    toast("Position counts saved", "success");
  } finally {
    setBtnLoading(btn, false);
  }
}

// --- AI Reports ---

async function checkAIStatus() {
  try {
    const data = await api("/ai/status");
    if (!data) return;
    document.getElementById("ai-enabled").style.display = data.enabled ? "" : "none";
    document.getElementById("ai-disabled").style.display = data.enabled ? "none" : "";
  } catch {
    document.getElementById("ai-disabled").style.display = "";
    document.getElementById("ai-enabled").style.display = "none";
  }
}

async function askAI(question) {
  const responseDiv = document.getElementById("ai-response");
  responseDiv.innerHTML = `
    <div class="ai-response-box ai-thinking">
      <div class="loader" style="justify-content:center;margin-bottom:0.75rem"><span></span><span></span><span></span></div>
      <p style="text-align:center; color:var(--gray-600); text-transform:uppercase; letter-spacing:0.1em; font-size:0.78rem; font-weight:600">Analyzing your team data...</p>
    </div>`;

  document.querySelectorAll(".ai-quick-actions button, #ai-question").forEach(el => el.disabled = true);

  try {
    const data = await api("/ai/report", "POST", { question });
    if (!data || data.error) {
      responseDiv.innerHTML = `<div class="ai-response-box" style="border-color:var(--red); background:var(--red-bg)"><p style="color:var(--red)">${esc(data?.error || "Request failed")}</p></div>`;
    } else {
      responseDiv.innerHTML = `<div class="ai-response-box">${renderMarkdown(data.answer)}</div>`;
      aiHistory.unshift({ question, answer: data.answer, time: new Date() });
      renderAIHistory();
    }
  } catch (e) {
    responseDiv.innerHTML = `<div class="ai-response-box" style="border-color:var(--red); background:var(--red-bg)"><p style="color:var(--red)">Request failed. Check your connection.</p></div>`;
  } finally {
    document.querySelectorAll(".ai-quick-actions button, #ai-question").forEach(el => el.disabled = false);
  }
}

function askAIFromInput() {
  const input = document.getElementById("ai-question");
  const q = input.value.trim();
  if (!q) return;
  input.value = "";
  askAI(q);
}

function renderMarkdown(text) {
  let html = esc(text);
  html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  const lines = html.split("\n");
  let result = "";
  let inList = false;
  for (const line of lines) {
    const bullet = line.match(/^[-*]\s+(.+)/);
    if (bullet) {
      if (!inList) { result += "<ul>"; inList = true; }
      result += `<li>${bullet[1]}</li>`;
    } else {
      if (inList) { result += "</ul>"; inList = false; }
      if (line.startsWith("<h")) {
        result += line;
      } else if (line.trim() === "") {
        result += "";
      } else {
        result += `<p>${line}</p>`;
      }
    }
  }
  if (inList) result += "</ul>";
  return result;
}

function renderAIHistory() {
  const card = document.getElementById("ai-history-card");
  const container = document.getElementById("ai-history");
  if (aiHistory.length === 0) { card.style.display = "none"; return; }
  card.style.display = "";
  container.innerHTML = aiHistory.map((h) => `
    <div class="ai-history-item" onclick="askAI('${esc(h.question.replace(/'/g, "\\'"))}')">
      <div class="q">${esc(h.question)}</div>
      <div class="a">${esc(h.answer.substring(0, 120))}${h.answer.length > 120 ? "..." : ""}</div>
    </div>
  `).join("");
}

// --- SMS ---

async function checkSMSStatus() {
  try {
    const data = await api("/sms/status");
    if (!data) return;
    document.getElementById("sms-enabled").style.display = data.enabled ? "" : "none";
    document.getElementById("sms-disabled").style.display = data.enabled ? "none" : "";
    document.getElementById("sms-broadcast-enabled").style.display = data.enabled ? "" : "none";
    document.getElementById("sms-broadcast-disabled").style.display = data.enabled ? "none" : "";
    if (data.enabled) loadSMSServices();
  } catch {
    document.getElementById("sms-disabled").style.display = "";
    document.getElementById("sms-broadcast-disabled").style.display = "";
  }
}

async function loadSMSServices() {
  const services = await api("/services?upcoming=true");
  if (!services) return;
  const sel = document.getElementById("sms-service");
  if (services.length === 0) {
    sel.innerHTML = '<option value="">No upcoming services</option>';
    return;
  }
  sel.innerHTML = services.map((s) =>
    `<option value="${s._id}">${formatDate(s.date)} — ${CONSTANTS.serviceTypes[s.service_type] || s.service_type}${s.name ? " — " + esc(s.name) : ""}</option>`
  ).join("");
  updateSMSPreview();
}

function updateSMSPreview() {
  const sel = document.getElementById("sms-service");
  const preview = document.getElementById("sms-preview");
  if (!sel.value) { preview.style.display = "none"; return; }
  const opt = sel.options[sel.selectedIndex];
  preview.style.display = "";
  document.getElementById("sms-preview-text").textContent =
    `Hi [Name], you will be serving at [Position] on ${opt.textContent.split(" — ")[0]}. Ensure to be on time for our unit prayers. God bless!`;
}

async function sendDutyNotifications(btn) {
  const serviceId = document.getElementById("sms-service").value;
  if (!serviceId) return toast("Select a service", "warning");
  if (!confirm("Send SMS to all assigned members for this service?")) return;

  setBtnLoading(btn, true);
  const resultDiv = document.getElementById("sms-duty-result");
  resultDiv.innerHTML = '<div class="loading-spinner">Sending messages...</div>';

  try {
    const result = await api("/sms/notify-service", "POST", { service_id: serviceId });
    if (!result) { resultDiv.innerHTML = ""; return; }

    let html = `<div class="alert alert-success" style="margin-bottom:0.5rem">Sent: ${result.sent} &middot; Skipped: ${result.skipped} &middot; Failed: ${result.failed}</div>`;
    if (result.details && result.details.length) {
      html += '<div style="font-size:0.78rem; max-height:200px; overflow-y:auto">';
      for (const d of result.details) {
        const color = d.status === "sent" ? "var(--green)" : d.status === "skipped" ? "var(--yellow)" : "var(--red)";
        html += `<div style="padding:0.25rem 0; border-bottom:1px solid var(--gray-200); color:${color}"><strong>${esc(d.name)}</strong> — ${d.status}${d.reason ? " (" + esc(d.reason) + ")" : ""}</div>`;
      }
      html += "</div>";
    }
    resultDiv.innerHTML = html;
    toast(`${result.sent} notifications sent`, "success");
  } finally {
    setBtnLoading(btn, false);
  }
}

async function sendBroadcast(btn) {
  const message = document.getElementById("sms-broadcast-msg").value.trim();
  if (!message) return toast("Write a message first", "warning");
  if (!confirm(`Send this message to all active members?\n\n"${message.substring(0, 100)}${message.length > 100 ? "..." : ""}"`)) return;

  setBtnLoading(btn, true);
  const resultDiv = document.getElementById("sms-broadcast-result");
  resultDiv.innerHTML = '<div class="loading-spinner">Sending...</div>';

  try {
    const result = await api("/sms/broadcast", "POST", { message });
    if (!result) { resultDiv.innerHTML = ""; return; }

    let html = `<div class="alert alert-success">Sent to ${result.sent} members`;
    if (result.skipped > 0) html += ` &middot; ${result.skipped} skipped (no phone)`;
    html += "</div>";
    if (result.skipped_names && result.skipped_names.length) {
      html += `<div style="font-size:0.72rem; color:var(--yellow); margin-top:0.25rem">No phone: ${result.skipped_names.join(", ")}</div>`;
    }
    resultDiv.innerHTML = html;
    toast(`Broadcast sent to ${result.sent} members`, "success");
  } finally {
    setBtnLoading(btn, false);
  }
}

// --- Profile ---

async function loadProfile() {
  const meData = await api("/auth/me");
  if (!meData) return;

  document.getElementById("p-name").value = meData.user.name;
  document.getElementById("p-email").value = meData.user.email;
  document.getElementById("p-phone").value = meData.user.phone || "";

  const unitsList = document.getElementById("my-units-list");
  unitsList.innerHTML = meData.memberships.map((m) => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:0.5rem 0; border-bottom:1px solid var(--gray-200)">
      <div>
        <strong>${esc(m.unit.name)}</strong>
        <span class="badge" style="font-size:0.65rem; margin-left:0.4rem">${m.role}</span>
      </div>
      ${m.unit.invite_code ? `<code style="font-size:0.75rem; letter-spacing:0.1em">${m.unit.invite_code}</code>` : ""}
    </div>
  `).join("");

  const adminCard = document.getElementById("unit-admin-card");
  const currentMembership = meData.memberships.find((m) => m.unit._id === activeUnitId);
  if (currentMembership && currentMembership.role === "owner") {
    adminCard.style.display = "";
    document.getElementById("unit-invite-code").textContent = currentMembership.unit.invite_code || "";
    loadUnitMembers();
  } else {
    adminCard.style.display = "none";
  }
}

async function saveProfile() {
  const name = document.getElementById("p-name").value.trim();
  const phone = document.getElementById("p-phone").value.trim();
  if (!name) return toast("Name is required", "warning");
  const result = await api("/auth/profile", "PUT", { name, phone });
  if (result) {
    currentUser.name = name;
    renderUserInfo();
    toast("Profile updated", "success");
  }
}

async function changePassword() {
  const current = document.getElementById("p-current-pw").value;
  const newPw = document.getElementById("p-new-pw").value;
  if (!newPw || newPw.length < 6) return toast("New password must be at least 6 characters", "warning");
  const result = await api("/auth/change-password", "POST", { current_password: current, new_password: newPw });
  if (result && result.success) {
    toast("Password changed", "success");
    document.getElementById("p-current-pw").value = "";
    document.getElementById("p-new-pw").value = "";
  }
}

async function joinUnit() {
  const code = document.getElementById("join-code").value.trim();
  if (!code) return toast("Enter an invite code", "warning");
  const result = await api("/units/join", "POST", { invite_code: code });
  if (result && result._id) {
    const meData = await api("/auth/me");
    if (meData) {
      currentMemberships = meData.memberships;
      populateUnitSwitcher();
    }
    document.getElementById("join-code").value = "";
    loadProfile();
    toast(`Joined "${result.name}"!`, "success");
  }
}

function copyInviteCode() {
  const code = document.getElementById("unit-invite-code").textContent;
  navigator.clipboard.writeText(code);
  toast("Invite code copied", "success");
}

async function regenerateInvite() {
  if (!confirm("Generate a new invite code? The old one will stop working.")) return;
  const result = await api(`/units/${activeUnitId}/regenerate-invite`, "POST");
  if (result && result.invite_code) {
    document.getElementById("unit-invite-code").textContent = result.invite_code;
  }
}

async function loadUnitMembers() {
  const members = await api(`/units/${activeUnitId}/members`);
  if (!members) return;
  const container = document.getElementById("unit-members-list");
  container.innerHTML = members.map((m) => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:0.5rem 0; border-bottom:1px solid var(--gray-200)">
      <div>
        <strong>${esc(m.user.name)}</strong>
        <span style="color:var(--gray-400); font-size:0.78rem; margin-left:0.3rem">${esc(m.user.email)}</span>
      </div>
      <div class="btn-group">
        ${m.role !== "owner" ? `
          <select class="form-select" style="font-size:0.75rem; padding:0.2rem 0.4rem; width:auto" onchange="changeRole('${m._id}', this.value)">
            <option value="admin" ${m.role === "admin" ? "selected" : ""}>Admin</option>
            <option value="member" ${m.role === "member" ? "selected" : ""}>Member</option>
          </select>
          <button class="btn btn-danger btn-sm" onclick="removeUnitMember('${m._id}', '${esc(m.user.name)}')">Remove</button>
        ` : '<span class="badge">Owner</span>'}
      </div>
    </div>
  `).join("");
}

async function changeRole(membershipId, role) {
  await api(`/units/${activeUnitId}/members/${membershipId}/role`, "PUT", { role });
}

async function removeUnitMember(membershipId, name) {
  if (!confirm(`Remove ${name} from this unit?`)) return;
  const result = await api(`/units/${activeUnitId}/members/${membershipId}`, "DELETE");
  if (result) toast(`${name} removed from unit`, "success");
  loadUnitMembers();
}

// --- Helpers ---

function populateServiceTypeSelects() {
  const options = Object.entries(CONSTANTS.serviceTypes)
    .map(([key, label]) => `<option value="${key}">${label}</option>`)
    .join("");
  document.getElementById("quick-type").innerHTML = options;
  document.getElementById("s-type").innerHTML = options;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getInitials(name) {
  return name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Sidebar ---

function toggleSidebar() {
  document.querySelector(".sidebar").classList.toggle("open");
  document.getElementById("sidebar-overlay").classList.toggle("active");
}

function closeSidebar() {
  document.querySelector(".sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("active");
}
