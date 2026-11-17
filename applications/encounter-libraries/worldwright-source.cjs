"use strict";

// Compile Worldwright's authored source with the selected Encounter frontend.
const { encode, decode, parse, print } = require("../encounter/bootstrap/rel-values.cjs");
const { getSourcePolicyMachine } = require("../encounter/bootstrap/source-policy-machine.cjs");
const basis = "733ed40e1261d70eefb00a7797e874a40e8a77532817d9bdc2843c831fbcc5b4";

const compiled = new Map();
function compileEncounterWithOrigins(file, text) {
  const machine = getSourcePolicyMachine();
  if (machine.basis !== basis) throw Error("Worldwright Encounter compiler basis changed.");
  const { value } = machine.compile(file, text);
  if (!value.ok) {
    throw Object.assign(Error(file + ": " + value.diagnostic.summary), { diagnostic: value.diagnostic });
  }
  return {surface:value.surface, origins:value.origins};
}

function freeze(item) {
  if (item && typeof item === "object") {
    for (const child of Object.values(item)) freeze(child);
    Object.freeze(item);
  }
  return item;
}

function compileEncounter(file, text) {
  const previous = compiled.get(file);
  if (previous?.text === text) return previous.surface;
  const surface = freeze(compileEncounterWithOrigins(file, text).surface);
  compiled.set(file, { text, surface });
  return surface;
}

const pointers = new Set(["root", "entry", "item", "value"]);
function encodeConfiguration(owner, value) {
  const document = owner + ".configuration";
  const id = name => name === "rel.document" ? document : document + "." + name;
  const facts = parse(encode(value)).map(({s,p,o,pol}) => ({s:id(s),p,o:pointers.has(p)?id(o):o,pol}));
  return print([{s:owner,p:"configuration",o:document}, ...facts]);
}
function decodeConfiguration(owner, text) {
  const facts = parse(text);
  const document = owner + ".configuration";
  const roots = facts.filter(f => f.s === owner && f.p === "configuration" && f.pol === "is");
  if (roots.length !== 1 || roots[0].o !== document) throw Error("Expected a typed configuration for " + owner);
  const id = name => {
    if (name === document) return "rel.document";
    if (!name.startsWith(document + ".")) throw Error("Configuration reference escapes " + owner);
    return name.slice(document.length + 1);
  };
  const typed = facts.filter(f => f.s === document || f.s.startsWith(document + "."))
    .map(({s,p,o,pol}) => ({s:id(s),p,o:pointers.has(p)?id(o):o,pol}));
  return structuredClone(decode(print(typed)));
}

module.exports = { compileEncounter, compileEncounterWithOrigins, encodeConfiguration, decodeConfiguration, encodeValue: encode, decodeValue: decode };
