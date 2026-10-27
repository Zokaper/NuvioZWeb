import test from "node:test";
import assert from "node:assert/strict";
import {
  orderedTrackLanguageAliases,
  cachedTrackLanguageInference
} from "../../js/z/playback/trackLanguageAliases.js";

test("cached alias ordering preserves the original longest-name-first order, including equal lengths", () => {
  const table = Object.freeze({
    spanish: "es",
    "spanish latin america": "es-419",
    english: "en",
    french: "fr"
  });
  const original = Object.entries(table).sort((left, right) => right[0].length - left[0].length);
  assert.deepEqual(orderedTrackLanguageAliases(table), original);
  assert.deepEqual(Object.keys(table), ["spanish", "spanish latin america", "english", "french"]);
});

test("repeated track inference sorts an unchanged table once and keeps separate vocabularies separate", () => {
  let reads = 0;
  const table = {
    get english() {
      reads++;
      return "en";
    }
  };
  const first = orderedTrackLanguageAliases(table);
  for (let i = 0; i < 1000; i++) assert.equal(orderedTrackLanguageAliases(table), first);
  assert.equal(reads, 1);
  assert.deepEqual(orderedTrackLanguageAliases({ english: "other" }), [["english", "other"]]);
});

test("inference caches ambiguous results and separates matching rules, text and vocabularies", () => {
  const table = {};
  let calls = 0;
  const ambiguous = () => (calls++, "");
  assert.equal(cachedTrackLanguageInference(table, "english french", "unique", ambiguous), "");
  assert.equal(cachedTrackLanguageInference(table, "english french", "unique", ambiguous), "");
  assert.equal(calls, 1);
  assert.equal(
    cachedTrackLanguageInference(table, "english french", "first", () => "en"),
    "en"
  );
  assert.equal(
    cachedTrackLanguageInference(table, "french", "unique", () => "fr"),
    "fr"
  );
  assert.equal(
    cachedTrackLanguageInference({}, "french", "unique", () => "other"),
    "other"
  );
});

test("unbounded track labels cannot grow the inference cache beyond 512 results", () => {
  const table = {};
  let calls = 0;
  for (let i = 0; i < 513; i++)
    cachedTrackLanguageInference(table, String(i), "unique", () => (calls++, "en"));
  cachedTrackLanguageInference(table, "512", "unique", () => (calls++, "en"));
  assert.equal(calls, 513);
  cachedTrackLanguageInference(table, "0", "unique", () => (calls++, "en"));
  assert.equal(calls, 514);
});
