import { tween } from "fake-motion";

// Project code beside the vendor library in one shared chunk (R10): the
// "relative" it compares against is a project mention, so the class keeps
// its original name even with trustVendorModules on.
for (const target of document.querySelectorAll<HTMLElement>("[data-motion]")) {
  if (getComputedStyle(target).position === "relative") tween(target);
}
