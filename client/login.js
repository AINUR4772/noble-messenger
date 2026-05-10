let emailGlobal = "";
let isLoading = false;

async function sendCode() {
  const email = document.getElementById("email").value.trim();
  if (!email) {
    alert("Введите email");
    return;
  }
  if (isLoading) return;
  isLoading = true;
  emailGlobal = email;

  try {
    const res = await fetch("http://localhost:3000/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    if (data.devCode) {
      alert(`[DEV] Код подтверждения: ${data.devCode}\n(Скопируйте его в поле ввода)`);
      document.getElementById("code").value = data.devCode;
    } else if (!res.ok) {
      throw new Error(data.error || "Ошибка отправки кода");
    } else {
      alert("Код отправлен на email!");
    }

    document.getElementById("step1").classList.add("hidden");
    document.getElementById("step2").classList.remove("hidden");
  } catch (err) {
    console.error(err);
    alert("Ошибка сервера или backend не запущен");
  }
  isLoading = false;
}

async function verifyCode() {
  const code = document.getElementById("code").value.trim();
  if (!code) {
    alert("Введите код");
    return;
  }

  try {
    const res = await fetch("http://localhost:3000/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailGlobal, code })
    });
    const data = await res.json();

    if (data.success) {
      localStorage.setItem('noble_email', emailGlobal);
      
      const userRes = await fetch("http://localhost:3000/get-user-full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailGlobal })
      });
      const userData = await userRes.json();

      if (userData.profile) {
        localStorage.setItem('noble_profile', JSON.stringify(userData.profile));
        if (userData.settings) localStorage.setItem('noble_settings', JSON.stringify(userData.settings));
        window.location.href = "chat.html";
      } else {
        window.location.href = "setup.html";
      }
    } else {
      alert("Неверный код");
    }
  } catch (err) {
    console.error(err);
    alert("Ошибка подключения к серверу");
  }
}