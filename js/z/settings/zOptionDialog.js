// Nuvio Z: an option in upstream's settings option dialog that explains itself.
//
// Mobile's choice cards (`NuvioChoiceCard`) give every option a sentence saying what it does, and a
// withheld one the reason it is withheld. Upstream's default option is a bare label, so its renderer
// calls this for the label instead. The fields are Z-namespaced (`zDescription`, `zDisabled`) so no
// upstream option can switch them on by accident: an option without them renders exactly as before.

export function renderDescribedOptionCopy(option, labelHtml, escapeHtml) {
  const label = `<span class="settings-dialog-option-label">${labelHtml}</span>`;
  const description = String(option?.zDescription || "").trim();
  if (!description) {
    return label;
  }
  return `<span class="z-option-copy">${label}<span class="z-option-description">${escapeHtml(description)}</span></span>`;
}

/** The option's extra classes: a card shape when it explains itself, greyed when it is withheld. */
export function zOptionClasses(option) {
  return `${option?.zDescription ? " z-described" : ""}${option?.zDisabled ? " is-disabled" : ""}`;
}
