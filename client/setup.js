document.getElementById("avatarInput").addEventListener("change", function (event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    document.getElementById("avatarPreview").src = e.target.result;
  };
  reader.readAsDataURL(file);
});

async function saveProfile() {
  const name = document.getElementById("name").value.trim();
  const username = document.getElementById("username").value.trim();
  const avatar = document.getElementById("avatarPreview").src;
  const email = localStorage.getItem("noble_email");

  if (!name || !username) {
    alert("Заполни имя и username!");
    return;
  }

  const cleanUsername = username.replace(/[^a-zA-Z0-9_]/g, "");
  const profile = {
    name,
    username: "@" + cleanUsername,
    avatar
  };

  localStorage.setItem("noble_profile", JSON.stringify(profile));

  if (email) {
    try {
      await fetch("http://localhost:3000/save-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...profile })
      });
    } catch (e) {
      console.warn("Не удалось сохранить профиль на сервере");
    }
  }

  window.location.href = "chat.html";
}