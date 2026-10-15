
    const loginForm = document.getElementById("loginForm");
    const usernameInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const errorMessage = document.getElementById("errorMessage");

    fetch("/api/auth/session")
      .then(response => {
        if (response.ok) window.location.replace("/admin.html");
      })
      .catch(() => {});

    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      errorMessage.style.display = "none";
      errorMessage.textContent = "";

      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to sign in.");
        window.location.replace("/admin.html");
      } catch (error) {
        errorMessage.textContent =
          error.message || "The login service is unavailable.";
        errorMessage.style.display = "block";
      }
    });