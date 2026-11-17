"use strict";

const search = document.querySelector("#search");
const groups = [...document.querySelectorAll("[data-group]")].map(group => ({
  group,
  items: [...group.querySelectorAll("[data-searchable]")],
}));
const units = document.querySelector("#host-services");
document.querySelector("#filter").hidden = false;

search.addEventListener("input", () => {
  const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  let matches = 0;
  for (const { group, items } of groups) {
    if (!items.length) continue;
    let visible = 0;
    for (const item of items) {
      const text = item.textContent.toLowerCase();
      item.hidden = !words.every(word => text.includes(word));
      if (!item.hidden) visible++;
    }
    matches += visible;
    group.hidden = visible === 0;
  }
  units.hidden = words.length > 0 && [...units.querySelectorAll("[data-searchable]")].every(item => item.hidden);
  if (words.length > 0 && !units.hidden) units.open = true;
  document.querySelector("#empty").hidden = matches > 0;
});
