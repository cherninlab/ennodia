for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy-target]")) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const label = button.getAttribute("aria-label") ?? "Copy";
  const text = button.querySelector<HTMLElement>(".copy-text");
  const idleText = text?.textContent ?? "";
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copyTarget ?? "");
    const feedback = button.closest(".setup-prompt")?.querySelector<HTMLElement>(".copy-feedback");
    clearTimeout(timer);
    try {
      await navigator.clipboard.writeText(target?.textContent?.replace(/\s+/g, " ").trim() ?? "");
      button.setAttribute("data-copied", "");
      button.setAttribute("aria-label", "Copied");
      if (text) text.textContent = "Copied";
      if (feedback) feedback.textContent = "Copied. Paste it into the conversation you have open.";
    } catch {
      // Clipboard access can be denied. Select the text so it's one keystroke away.
      if (target) window.getSelection()?.selectAllChildren(target);
      if (text) text.textContent = "Text selected";
      if (feedback) feedback.textContent = "Text selected. Copy it with your keyboard.";
    }
    timer = setTimeout(() => {
      button.removeAttribute("data-copied");
      button.setAttribute("aria-label", label);
      if (text) text.textContent = idleText;
      if (feedback) feedback.textContent = "";
    }, 3500);
  });
}
