const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "catalog script exists");

const context = {
  document: {
    addEventListener() {},
    getElementById() { return {}; },
    querySelectorAll() { return []; },
  },
  window: {},
  console,
};
vm.runInNewContext(
  script + "\nglobalThis.catalogUnderTest = { CATALOG_DATABASE, getCardArtworkMarkup: typeof getCardArtworkMarkup === 'function' ? getCardArtworkMarkup : undefined, isComingSoon: typeof isComingSoon === 'function' ? isComingSoon : undefined, canAddToCart: typeof canAddToCart === 'function' ? canAddToCart : undefined, getCardOfferLabel: typeof getCardOfferLabel === 'function' ? getCardOfferLabel : undefined };",
  context,
);

const { CATALOG_DATABASE: cards, getCardArtworkMarkup, isComingSoon, canAddToCart, getCardOfferLabel } = context.catalogUnderTest;
const expected = new Map([
  ["ravi and nila.png", "The Adventures of Ravi & Nila"],
  ["clever little tales.png", "Clever Little Tales"],
  ["floor is lava.png", "Floor is Lava"],
  ["tales of kindness.png", "Storynory Card"],
  ["play and sing along .png", "Play and Sing Along"],
  ["dream melodies.png", "Dreamy Melodies"],
  ["sounds around me.png", "Sounds Around Me"],
  ["Frame 46.png", "Mitthu the Parrot"],
  ["Group 24553.png", "Nani"],
  ["make your own .png", "Make Your Own"],
]);

test("every supplied creative appears once under its respective name", () => {
  const available = cards.filter(card => card.image);
  assert.equal(available.length, expected.size);
  for (const [file, title] of expected) {
    const matches = available.filter(card => path.basename(card.image) === file);
    assert.equal(matches.length, 1, file);
    assert.equal(matches[0].title, title);
    assert.ok(fs.existsSync(path.join(projectRoot, matches[0].image)), file);
  }
  assert.equal(available.filter(card => card.cardType === "ai").length, 2);
  assert.equal(available.filter(card => card.cardType === "myo").length, 1);
});

test("available art uses the supplied image and older cards show a coming soon layer", () => {
  assert.equal(typeof getCardArtworkMarkup, "function", "artwork renderer exists");
  assert.equal(typeof isComingSoon, "function", "coming soon status exists");
  const available = cards.find(card => card.image);
  const older = cards.find(card => card.id === "s1");
  assert.equal(isComingSoon(available), false);
  assert.equal(isComingSoon(older), true);
  assert.match(getCardArtworkMarkup(available), /<img[^>]+card-artwork-image/);
  assert.doesNotMatch(getCardArtworkMarkup(available), /Coming soon/);
  assert.match(getCardArtworkMarkup(older), /coming-soon-overlay[^>]*><span>Coming soon<\/span>/);
});

test("box cards and coming soon cards cannot be purchased as individual cards", () => {
  assert.equal(typeof canAddToCart, "function", "purchase availability rule exists");
  for (const card of cards) {
    assert.equal(canAddToCart(card), false, card.title);
  }
  assert.ok(cards.filter(card => card.image).every(card => card.included === true));
});

test("supplied artwork does not claim unprovided ages or running times", () => {
  for (const card of cards.filter(card => card.image)) {
    assert.equal(card.ageRange, null, card.title);
    assert.equal(card.estimatedMinutes, null, card.title);
  }
});

test("one offer label applies to the grid and detail view", () => {
  assert.equal(typeof getCardOfferLabel, "function", "offer label rule exists");
  assert.equal(getCardOfferLabel(cards.find(card => card.image)), "Included with Cheeko");
  assert.equal(getCardOfferLabel(cards.find(card => card.id === "s1")), "Coming soon");
});
