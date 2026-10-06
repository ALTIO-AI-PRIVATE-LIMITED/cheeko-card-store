const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script);

function createPlayer({ playError } = {}) {
  const elements = new Map();
  const makeElement = () => ({
    innerText: "",
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      contains(value) { return this.values.has(value); },
    },
  });
  const audio = {
    src: "",
    currentTime: 0,
    paused: true,
    playCalls: 0,
    pauseCalls: 0,
    play() {
      this.playCalls++;
      if (playError) return Promise.reject(playError);
      this.paused = false;
      this.onplay?.();
      return Promise.resolve();
    },
    pause() {
      this.pauseCalls++;
      this.paused = true;
      this.onpause?.();
    },
    removeAttribute(name) { if (name === "src") this.src = ""; },
    load() {},
  };
  elements.set("previewAudio", audio);
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelectorAll() { return []; },
  };
  const context = { document, window: { location: { hostname: "localhost" } }, console };
  vm.runInNewContext(
    script + "\nglobalThis.previewUnderTest = { cards: CATALOG_DATABASE, state: appState, launchContentPlayer, togglePausePlayback, stopPlayback, openCardSession };",
    context,
  );
  return { ...context.previewUnderTest, elements, audio };
}

test("recorded card preview plays the backend MP3 and stops after one minute", async () => {
  const player = createPlayer();
  const card = player.cards.find(item => item.id === "art-ravi-nila");
  await player.openCardSession(card);

  assert.equal(player.audio.src, "http://127.0.0.1:8002/toy/admin/rfid/content-pack/sample/LE_Ravi");
  assert.equal(player.audio.playCalls, 1);
  assert.equal(player.elements.get("playbackModal").classList.contains("open"), true);

  player.audio.currentTime = 60;
  player.audio.ontimeupdate();
  assert.equal(player.elements.get("playbackTimer").innerText, "01:00");
  assert.equal(player.audio.paused, true);
  assert.equal(player.elements.get("playbackStatus").innerText, "Preview complete");

  player.stopPlayback();
  assert.equal(player.audio.src, "");
});

test("failed recording load shows an error instead of a running timer", async () => {
  const player = createPlayer({ playError: new Error("Failed to load") });
  await player.launchContentPlayer(player.cards.find(item => item.id === "art-clever-tales"));

  assert.match(player.elements.get("playbackStatus").innerText, /unavailable/i);
  assert.equal(player.elements.get("playbackTimer").innerText, "00:00");
  assert.equal(player.state.player.isPlaying, false);
});

test("pause and resume control the actual recording", async () => {
  const player = createPlayer();
  await player.launchContentPlayer(player.cards.find(item => item.id === "art-floor-lava"));
  player.togglePausePlayback();
  assert.equal(player.audio.paused, true);
  assert.equal(player.state.player.isPlaying, false);
  assert.equal(player.elements.get("playbackWrap").classList.contains("paused"), true);

  await player.togglePausePlayback();
  assert.equal(player.audio.playCalls, 2);
  assert.equal(player.state.player.isPlaying, true);
  player.stopPlayback();
  assert.equal(player.audio.paused, true);
  assert.equal(player.audio.src, "");
});

test("cards without a public recording do not open the preview player", () => {
  const player = createPlayer();
  player.openCardSession(player.cards.find(item => item.id === "art-nani"));
  assert.equal(player.audio.playCalls, 0);
  assert.equal(player.elements.get("playbackModal").classList.contains("open"), false);
});
