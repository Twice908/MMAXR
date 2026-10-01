const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("App root element is missing");
}

app.textContent = "MMA-XR";