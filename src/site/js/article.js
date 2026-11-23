const protection = document.querySelector("[data-protection]");

if (protection && !protection.hidden) {
  const form = protection.querySelector("[data-unlock-form]");
  const passwordInput = form.querySelector("input");
  const unlockButton = form.querySelector("button");
  const status = protection.querySelector("#unlock-status");
  const articleBody = document.querySelector("[data-article-body]");
  const articleData = document.querySelector("#article-data");
  const subtle = window.crypto?.subtle;

  const fromBase64 = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

  async function decryptArticle(password, encrypted) {
    const { salt, iv, ciphertext, iterations } = encrypted;
    const passwordKey = await subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const articleKey = await subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(salt), iterations },
      passwordKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const decrypted = await subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv) },
      articleKey,
      fromBase64(ciphertext),
    );

    return new TextDecoder().decode(decrypted);
  }

  function startUnlockForm() {
    if (!subtle) {
      status.textContent = "请使用支持加密功能的浏览器，通过 HTTPS 或 localhost 打开此页面。";
      return;
    }

    let encrypted;
    try {
      ({ encrypted } = JSON.parse(articleData.textContent));
      if (!encrypted) {
        throw new Error("Missing encrypted article");
      }
    } catch {
      status.textContent = "文章暂时无法解锁，请刷新页面后重试。";
      return;
    }

    passwordInput.addEventListener("input", () => {
      passwordInput.removeAttribute("aria-invalid");
      status.textContent = "";
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (unlockButton.disabled) {
        return;
      }

      passwordInput.readOnly = true;
      unlockButton.disabled = true;
      unlockButton.textContent = "正在解锁…";
      passwordInput.removeAttribute("aria-invalid");
      status.textContent = "";

      try {
        // The build sanitizes the article HTML before encrypting it.
        articleBody.innerHTML = await decryptArticle(passwordInput.value, encrypted);
        passwordInput.value = "";
        protection.hidden = true;
        articleBody.hidden = false;
        articleBody.focus();
      } catch {
        status.textContent = "密码有误或文章无法读取，请检查密码后重试。";
        passwordInput.setAttribute("aria-invalid", "true");
        passwordInput.focus();
        passwordInput.select();
      } finally {
        passwordInput.readOnly = false;
        unlockButton.disabled = false;
        unlockButton.textContent = "解锁文章";
      }
    });

    form.hidden = false;
  }

  startUnlockForm();
}
