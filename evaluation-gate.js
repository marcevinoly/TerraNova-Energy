(function () {
  const config = window.TERRANOVA_EVALUATION_GATE;
  if (!config) return;

  const dashboard = document.querySelector(".dashboard");
  const header = dashboard?.querySelector(".dashboard-header");
  if (!dashboard || !header) return;

  const inputPanel = document.querySelector(".input-panel");
  const brandRow = inputPanel?.querySelector(".brand-row");
  const tabs = inputPanel?.querySelector(".tabs");
  if (inputPanel && brandRow && tabs && !inputPanel.querySelector(".input-panel-sticky-header")) {
    const stickyHeader = document.createElement("div");
    stickyHeader.className = "input-panel-sticky-header";
    inputPanel.insertBefore(stickyHeader, brandRow);
    stickyHeader.appendChild(brandRow);
    stickyHeader.appendChild(tabs);
  }

  dashboard.classList.add("evaluation-gate-dashboard", "is-locked");
  const actions = header.querySelector(".dashboard-actions") || header;
  const resultButtons = [...actions.querySelectorAll("button")];
  resultButtons.forEach((button) => button.classList.add("evaluation-gate-hidden"));

  const generateButton = document.createElement("button");
  generateButton.type = "button";
  generateButton.className = "generate-evaluation-button disabled";
  generateButton.textContent = config.buttonLabel;
  actions.appendChild(generateButton);

  const lock = document.createElement("div");
  lock.className = "evaluation-lock";
  lock.innerHTML = `<strong>${config.lockTitle}</strong><p>${config.lockCopy}</p>`;
  dashboard.insertBefore(lock, header.nextSibling);

  (config.requiredIds || []).forEach((id) => {
    const input = document.getElementById(id);
    const label = input?.closest("label");
    if (!input || !label || label.querySelector(".required-marker")) return;
    const marker = document.createElement("span");
    marker.className = "required-marker";
    marker.textContent = "*";
    if (input.type === "checkbox" && label.querySelector("span")) {
      label.querySelector("span").appendChild(marker);
    } else {
      const directChild = input.parentElement === label ? input : input.parentElement;
      const textNode = [...label.childNodes].find((node) => node.nodeType === 3 && node.textContent.trim());
      if (textNode) {
        const title = document.createElement("span");
        title.className = "field-label-title";
        title.textContent = textNode.textContent.trim();
        title.appendChild(marker);
        label.replaceChild(title, textNode);
      } else {
        label.insertBefore(marker, directChild);
      }
    }
  });

  function isReady() {
    try { return Boolean(config.isReady(calculate())); }
    catch (error) { return false; }
  }

  function refresh() {
    generateButton.classList.toggle("disabled", !isReady());
  }

  const form = document.getElementById("project-form");
  form?.addEventListener("input", refresh);
  form?.addEventListener("change", refresh);

  generateButton.addEventListener("click", async () => {
    const result = calculate();
    if (!config.isReady(result)) {
      const notice = document.getElementById("leadGateNotice");
      if (notice) notice.hidden = false;
      return;
    }

    generateButton.disabled = true;
    generateButton.textContent = "Generando evaluación…";
    const sent = await sendLeadToTerraNova(result, config.action);
    generateButton.disabled = false;
    generateButton.textContent = config.buttonLabel;
    if (!sent) return;

    dashboard.classList.remove("is-locked");
    lock.hidden = true;
    generateButton.classList.add("evaluation-gate-hidden");
    resultButtons.forEach((button) => button.classList.remove("evaluation-gate-hidden"));
    const notice = document.getElementById("leadGateNotice");
    if (notice) notice.hidden = true;
  });

  refresh();
})();
