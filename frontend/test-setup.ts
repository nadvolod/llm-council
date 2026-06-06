import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement scrollIntoView; ChatInterface calls it on mount/update.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
