function showError(msg) {
  const el = document.getElementById("error-msg");
  if (el) {
    el.textContent = msg;
    el.style.display = "block";
  }
}

function clearError() {
  const el = document.getElementById("error-msg");
  if (el) el.style.display = "none";
}

function googleLogin() {
  window.location.href = "/auth/google";
}

function checkExistingAuth() {
  const token = localStorage.getItem("auth_token");
  if (token) {
    redirectAfterAuth(token);
  }
}

async function loadAuthConfig() {
  try {
    const res = await fetch("/api/config");
    const config = await res.json();
    if (!config.google_oauth) {
      document.querySelectorAll(".google-btn, .auth-divider").forEach((el) => el.style.display = "none");
    }
  } catch {}
}
loadAuthConfig();

async function redirectAfterAuth(token) {
  try {
    const res = await fetch("/api/auth/me", {
      headers: { "Authorization": "Bearer " + token },
    });
    if (!res.ok) {
      localStorage.removeItem("auth_token");
      return;
    }
    window.location.href = "/app";
  } catch {
    localStorage.removeItem("auth_token");
  }
}
