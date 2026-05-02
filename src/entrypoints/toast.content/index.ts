export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "rippl-toast") {
        showToast(msg.domain, msg.duration);
      }
    });
  },
});

function showToast(domain: string, duration: string) {
  // Create shadow DOM host to avoid style conflicts
  const host = document.createElement("div");
  host.id = "rippl-toast-host";
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      pointer-events: none;
    }

    .toast {
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
      background: #EFEAE0;
      color: #1F1C16;
      border: 1px solid #D8CFB9;
      border-left: 3px solid #5C7A52;
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.4;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      opacity: 0;
      transform: translateY(8px);
      animation: rippl-in 0.25s ease forwards;
      pointer-events: auto;
      max-width: 280px;
    }

    .toast.fade-out {
      animation: rippl-out 0.3s ease forwards;
    }

    .toast-label {
      color: #8C8478;
      font-size: 11px;
      font-weight: 400;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 2px;
    }

    @keyframes rippl-in {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes rippl-out {
      to {
        opacity: 0;
        transform: translateY(8px);
      }
    }
  `;

  const toast = document.createElement("div");
  toast.className = "toast";

  const label = document.createElement("div");
  label.className = "toast-label";
  label.textContent = "rippl";

  const text = document.createElement("div");
  text.textContent = `Tracked ${duration} on ${domain}`;

  toast.appendChild(label);
  toast.appendChild(text);
  shadow.appendChild(style);
  shadow.appendChild(toast);
  document.body.appendChild(host);

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    toast.classList.add("fade-out");
    toast.addEventListener("animationend", () => {
      host.remove();
    });
  }, 4000);
}
