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

async function redirectAfterAuth(token) {
  try {
    const res = await fetch("/api/auth/me", {
      headers: { "Authorization": "Bearer " + token },
    });
    if (!res.ok) {
      localStorage.removeItem("auth_token");
      return;
    }
    const data = await res.json();
    if (data.memberships && data.memberships.length > 0) {
      window.location.href = "/app";
    } else {
      window.location.href = "/onboarding.html";
    }
  } catch {
    localStorage.removeItem("auth_token");
  }
}
