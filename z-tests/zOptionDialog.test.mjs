import assert from "node:assert/strict";
import test from "node:test";
import { renderDescribedOptionCopy, zOptionClasses } from "../js/z/settings/zOptionDialog.js";

const escapeHtml = (value) => String(value).replace(/</g, "&lt;");

test("an option without Z fields renders exactly as upstream's bare label", () => {
  const option = { id: "x", label: "Label", description: "upstream field", disabled: true };
  assert.equal(
    renderDescribedOptionCopy(option, "Label", escapeHtml),
    '<span class="settings-dialog-option-label">Label</span>'
  );
  assert.equal(zOptionClasses(option), "");
});

test("a described option carries its sentence, escaped, under the label", () => {
  const html = renderDescribedOptionCopy({ zDescription: "a <b> c" }, "Label", escapeHtml);
  assert.match(html, /class="z-option-copy"/);
  assert.match(html, /<span class="z-option-description">a &lt;b> c<\/span>/);
  assert.equal(zOptionClasses({ zDescription: "x" }), " z-described");
});

test("a withheld option is greyed", () => {
  assert.equal(
    zOptionClasses({ zDescription: "why", zDisabled: true }),
    " z-described is-disabled"
  );
});
