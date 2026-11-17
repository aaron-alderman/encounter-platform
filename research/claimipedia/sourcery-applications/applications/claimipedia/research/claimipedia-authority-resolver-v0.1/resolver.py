"""Read-only resolver for exact, checkpointed Claimipedia authority records."""
import argparse
import hashlib
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
DOCS = HERE.parents[1] / "docs"
SAFE_NAME = re.compile(r"[a-z0-9][a-z0-9.-]*\.(?:json|mjs)")
HASH = re.compile(r"sha256:[0-9a-f]{64}")
AFFIRMATIVE = {
    "admitted-provisional-successor-method",
    "admitted",
    "admitted-successor-mapping-family",
    "admitted-versioned-successor-candidate-not-canonical-or-released",
}
UNRESOLVED = {"retained-unresolved", "retained-as-near-miss-pending-separate-successor-review"}


class ArchiveError(ValueError):
    pass


def digest(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


def pointer(path):
    return "/" + "/".join(str(step).replace("~", "~0").replace("/", "~1") for step in path)


class AuthorityArchive:
    def __init__(self, docs, bindings):
        self.docs = Path(docs).resolve()
        self.bindings = bindings
        if bindings.get("schema") != "claimipedia-archived-authority-bindings/1":
            raise ArchiveError("Unsupported archive binding schema")

    def ordinal(self, as_of):
        try:
            return self.bindings["checkpoints"][as_of]
        except KeyError as error:
            raise ArchiveError("Unknown checkpoint") from error

    def available(self, source, cutoff):
        return self.bindings["catalog"][source]["introduced"] <= cutoff

    def checked_bytes(self, filename, expected):
        if not SAFE_NAME.fullmatch(filename) or not HASH.fullmatch(expected):
            raise ArchiveError("Invalid record identity")
        path = self.docs / filename
        if path.resolve().parent != self.docs:
            raise ArchiveError("Record escapes the archive")
        try:
            data = path.read_bytes()
        except OSError as error:
            raise ArchiveError(f"Missing archive artifact: {filename}") from error
        if digest(data) != expected:
            raise ArchiveError(f"Digest mismatch: {filename}")
        return data

    def record(self, name, cutoff, kind):
        identity = self.bindings["catalog"][name]
        if identity["kind"] != kind or not self.available(name, cutoff):
            raise ArchiveError("Record is inapplicable at the checkpoint")
        return json.loads(self.checked_bytes(name, identity["sha256"]))

    def verified_bundle(self, binding, cutoff):
        review_name, directive_name = binding["review"], binding["directive"]
        ledger_name, receipt_name = binding["ledger"], binding["receipt"]
        directive = self.record(directive_name, cutoff, "directive")
        ledger = self.record(ledger_name, cutoff, "ledger")
        receipt = self.record(receipt_name, cutoff, "receipt")
        review_identity = self.bindings["catalog"][review_name]["sha256"]
        directive_identity = self.bindings["catalog"][directive_name]["sha256"]
        ledger_identity = self.bindings["catalog"][ledger_name]["sha256"]
        if (receipt["status"] != "verified-human-approval" or receipt["aiAuthority"] != "none"
                or directive["status"] != "approved"
                or not directive["approvedBy"]
                or directive["approvedBy"] != receipt["approvedBy"]
                or ledger["approvedBy"] != directive["approvedBy"]
                or ledger["approval"] != directive["id"]
                or receipt["inputs"].get(review_name) != review_identity
                or receipt["inputs"].get(directive_name) != directive_identity
                or receipt["outputs"].get(ledger_name) != ledger_identity
                or directive["exactArtifacts"].get(review_name) != review_identity):
            raise ArchiveError("Unbound human decision or successor")
        for name, expected in directive["exactArtifacts"].items():
            if receipt["inputs"].get(name) != expected:
                raise ArchiveError("Directive and receipt disagree on input identity")
        for name, expected in receipt["inputs"].items():
            self.checked_bytes(name, expected)
        # The canonical ledger was read and checked above. An unrelated generated
        # renderer listed as a second output is outside this read-only decision.
        return directive, ledger

    def successors(self, cutoff):
        result = {}
        for binding in self.bindings["decisions"].values():
            review, ledger = binding["review"], binding["ledger"]
            if review in result or not self.available(ledger, cutoff):
                continue
            self.verified_bundle(binding, cutoff)
            result[review] = ledger
        return result

    def resolve(self, action, as_of):
        def result(state, citation=None, scope=None, reason=None):
            return {"decision": state, "citation": citation, "action": action, "asOf": as_of,
                    "scope": scope, "reason": reason}

        try:
            cutoff = self.ordinal(as_of)
            binding = self.bindings["decisions"].get(action)
            if binding is None:
                raise ArchiveError("Unknown exact decision scope")
            review_name = binding["review"]
            review = self.record(review_name, cutoff, "review")
            rows = review["reviewPacket"]["decisions"]
            matches = [(i, row) for i, row in enumerate(rows) if row["subject"] == binding["subject"]]
            if len(matches) != 1 or matches[0][1]["decision"] is not None:
                raise ArchiveError("Exact pending review row missing or ambiguous")
            index, _ = matches[0]
            citation = {
                "record": review_name, "sha256": self.bindings["catalog"][review_name]["sha256"],
                "pointer": pointer(["reviewPacket", "decisions", index, "decision"]),
            }
            ledger_name = binding["ledger"]
            if not self.available(ledger_name, cutoff):
                return result("pending", citation, binding["subject"], "No eligible successor at this checkpoint")
            directive, ledger = self.verified_bundle(binding, cutoff)
            if directive["approvedBy"] != review["reviewPacket"]["requiredReviewer"]:
                raise ArchiveError("Approval does not match the required reviewer")
            row = ledger
            for step in binding["ledgerPath"]:
                row = row[step]
            subject_key = binding["ledgerSubjectKey"]
            if (subject_key and row[subject_key] != binding["subject"]) or row["admission"] != directive["id"]:
                raise ArchiveError("Ledger decision scope does not match the reviewed action")
            field = binding["ledgerDecisionKey"]
            value = row[field]
            authorization = directive["decisions"][binding["directiveKey"]]
            if value in AFFIRMATIVE and authorization.startswith("admit-"):
                state = "approved"
            elif value in UNRESOLVED and authorization.startswith("retain-"):
                state = "pending"
            else:
                raise ArchiveError("Unsupported or inconsistent exact disposition")
            citation = {
                "record": ledger_name, "sha256": self.bindings["catalog"][ledger_name]["sha256"],
                "pointer": pointer([*binding["ledgerPath"], field]),
                "directive": binding["directive"], "receipt": binding["receipt"],
            }
            return result(state, citation, binding["subject"], value)
        except (ArchiveError, KeyError, TypeError, IndexError, AttributeError, json.JSONDecodeError) as error:
            return result("unresolved", reason=str(error))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action")
    parser.add_argument("--as-of", required=True, help="registered checkpoint ID")
    args = parser.parse_args()
    protocol_bytes = (HERE / "preregistration.json").read_bytes()
    expected = (HERE / "preregistration.sha256").read_text().split()[0]
    if digest(protocol_bytes)[7:] != expected:
        raise ArchiveError("Preregistration digest mismatch")
    protocol = json.loads(protocol_bytes)
    binding_bytes = (HERE / "archive-bindings.json").read_bytes()
    if digest(binding_bytes)[7:] != protocol["archiveBindingsSha256"]:
        raise ArchiveError("Archive binding digest mismatch")
    archive = AuthorityArchive(DOCS, json.loads(binding_bytes))
    print(json.dumps(archive.resolve(args.action, args.as_of), indent=2))


if __name__ == "__main__":
    main()
