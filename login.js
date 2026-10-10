
    const loginForm = document.getElementById("loginForm");
    const usernameInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const errorMessage = document.getElementById("errorMessage");

    loginForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      errorMessage.style.display = "none";
      errorMessage.textContent = "";

      if (
        username.toLowerCase() === "admin" &&
        password === "12345678"
      ) {
        window.location.href = "admin.html";
      } else {
        errorMessage.textContent =
          "Incorrect username or password. Please try again.";
        errorMessage.style.display = "block";
      }
    });