const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script);

const elements = new Map();
const audioInstances = [];
class FakeAudio {
  constructor(src) {
    this.src = src;
    this.currentTime = 0;
    this.listeners = new Map();
    this.playCount = 0;
    audioInstances.push(this);
  }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  play() { this.playCount++; return Promise.resolve(); }
  pause() {}
  removeAttribute() {}
  load() {}
}
const element = (id) => {
  if (!elements.has(id)) {
    elements.set(id, {
      innerText: "",
      disabled: false,
      classList: { add() {}, remove() {} },
    });
  }
  return elements.get(id);
};
const context = {
  document: {
    addEventListener() {},
    getElementById: element,
    querySelectorAll() { return []; },
  },
  window: { CHEEKO_API_BASE_URL: "https://api.example.test" },
  Audio: FakeAudio,
  console,
};
vm.runInNewContext(
  script + "\nglobalThis.previewUnderTest = { CATALOG_DATABASE, getPreviewPackCode, getPreviewUrl, onPreviewTimeUpdate, openCardSession, stopPlayback, appState };",
  context,
);

const { CATALOG_DATABASE: cards, getPreviewPackCode, getPreviewUrl, onPreviewTimeUpdate, openCardSession, stopPlayback, appState } = context.previewUnderTest;

test("the six photographed content cards map to their backend pack codes", () => {
  const expected = {
    "art-ravi-nila": "LE_Ravi",
    "art-clever-tales": "SF_CLV",
    "art-floor-lava": "FL-01",
    "art-storynory": "STYNRY",
    "art-sing-along": "RMS_PSA",
    "art-dreamy-melodies": "RMS_DM",
  };
  for (const [id, packCode] of Object.entries(expected)) {
    assert.equal(getPreviewPackCode(cards.find(card => card.id === id)), packCode);
  }
  assert.equal(getPreviewPackCode(cards.find(card => card.id === "art-nani")), null);
  assert.equal(getPreviewPackCode(cards.find(card => card.id === "s1")), null);
});

test("preview requests the backend sample endpoint for the selected pack", () => {
  assert.equal(getPreviewUrl("FL-01"), "https://api.example.test/toy/admin/rfid/content-pack/sample/FL-01");
});

test("clicking a content card starts its backend audio, including Floor is Lava", async () => {
  openCardSession(cards.find(card => card.id === "art-floor-lava"));
  const audio = audioInstances.at(-1);
  assert.equal(audio.src, "https://api.example.test/toy/admin/rfid/content-pack/sample/FL-01");
  assert.equal(audio.playCount, 1);
  await Promise.resolve();
  assert.equal(appState.player.isPlaying, true);
  stopPlayback();
});

test("playback stops at one minute even if the media is longer", () => {
  let pauseCount = 0;
  const audio = { currentTime: 59.8, pause() { pauseCount++; } };
  appState.player.audio = audio;
  appState.player.isPlaying = true;
  onPreviewTimeUpdate(audio);
  assert.equal(pauseCount, 0);
  audio.currentTime = 60.2;
  onPreviewTimeUpdate(audio);
  assert.equal(pauseCount, 1);
  assert.equal(appState.player.isPlaying, false);
  assert.equal(element("playbackTimer").innerText, "01:00 / 01:00");
});
