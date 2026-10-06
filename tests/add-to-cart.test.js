const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "catalog script exists");

function createCatalog() {
  const elements = new Map();
  const confirmCalls = [];
  let confirmResult = false;
  const makeElement = () => ({
    innerHTML: "",
    innerText: "",
    style: {},
    children: [],
    listeners: {},
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      contains(value) { return this.values.has(value); },
      toggle(value, force) {
        if (force) this.add(value);
        else this.remove(value);
      },
    },
    addEventListener(event, callback) { this.listeners[event] = callback; },
    appendChild(child) { this.children.push(child); },
    cloneNode() { return makeElement(); },
    parentNode: {
      replaceChild(newNode, oldNode) {
        newNode.parentNode = this;
        newNode.id = oldNode.id;
        if (oldNode.id) elements.set(oldNode.id, newNode);
      },
    },
    querySelector(selector) {
      this.controls ??= new Map();
      if (!this.controls.has(selector)) this.controls.set(selector, makeElement());
      return this.controls.get(selector);
    },
  });
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (!elements.has(id)) {
        const element = makeElement();
        element.id = id;
        elements.set(id, element);
      }
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    createElement: makeElement,
  };
  const context = {
    document,
    window: { confirm(message) { confirmCalls.push(message); return confirmResult; } },
    console,
  };
  vm.runInNewContext(
    script + "\nglobalThis.catalogUnderTest = { cards: CATALOG_DATABASE, state: appState, renderGrid, addToCart, openCardDetailModal };",
    context,
  );
  return {
    ...context.catalogUnderTest,
    elements,
    confirmCalls,
    setConfirmResult(result) { confirmResult = result; },
  };
}

test("available cards show an add to cart control", () => {
  const catalog = createCatalog();
  const available = catalog.cards.find(card => card.image);
  const comingSoon = catalog.cards.find(card => !card.image);
  catalog.renderGrid([available, comingSoon]);

  const [availableTile, comingSoonTile] = catalog.elements.get("catalogGrid").children;
  assert.match(availableTile.innerHTML, /add-to-cart-btn[^>]*aria-label="Add to cart"/);
  assert.match(availableTile.innerHTML, /add-to-cart-btn[^>]*>\s*Add to cart\s*<\/button>/);
  assert.doesNotMatch(availableTile.innerHTML, /add-to-cart-btn[^>]*disabled/);
  assert.match(comingSoonTile.innerHTML, /add-to-cart-btn[^>]*disabled/);
});

test("included card is added only after accepting the Cheeko alert", () => {
  const catalog = createCatalog();
  const available = catalog.cards.find(card => card.image);
  catalog.addToCart(available.id);

  assert.equal(catalog.state.cart.length, 0);
  assert.equal(catalog.confirmCalls.length, 1);
  assert.match(catalog.confirmCalls[0], /already included with Cheeko/i);
  assert.equal(catalog.elements.has("cartDrawer"), false);

  catalog.setConfirmResult(true);
  catalog.addToCart(available.id);

  assert.equal(catalog.state.cart.length, 1);
  assert.equal(catalog.state.cart[0].cardId, available.id);
  assert.equal(catalog.state.cart[0].quantity, 1);
  assert.equal(catalog.elements.get("cartCountBadge").innerText, 1);
  assert.equal(catalog.elements.get("cartDrawer").classList.contains("open"), true);
  assert.equal(catalog.elements.get("cartOverlay").classList.contains("open"), true);
  assert.doesNotMatch(catalog.elements.get("cartItemsList").children[0].innerHTML, /null years/);
});

test("coming soon cards cannot reach the confirmation or cart", () => {
  const catalog = createCatalog();
  const comingSoon = catalog.cards.find(card => !card.image);
  catalog.setConfirmResult(true);
  catalog.addToCart(comingSoon.id);

  assert.equal(catalog.confirmCalls.length, 0);
  assert.equal(catalog.state.cart.length, 0);
});

test("detail view closes only after the included card is confirmed", () => {
  const catalog = createCatalog();
  const available = catalog.cards.find(card => card.image);
  catalog.openCardDetailModal(available);
  const detailModal = catalog.elements.get("cardDetailModal");
  const addButton = catalog.elements.get("detailModalAddToCartBtn");

  assert.equal(addButton.disabled, false);
  assert.equal(addButton.innerText, "Add to cart");
  assert.equal(detailModal.classList.contains("open"), true);

  addButton.listeners.click();
  assert.equal(catalog.state.cart.length, 0);
  assert.equal(detailModal.classList.contains("open"), true);

  catalog.setConfirmResult(true);
  addButton.listeners.click();
  assert.equal(catalog.state.cart.length, 1);
  assert.equal(detailModal.classList.contains("open"), false);
  assert.equal(catalog.elements.get("cartDrawer").classList.contains("open"), true);
});
