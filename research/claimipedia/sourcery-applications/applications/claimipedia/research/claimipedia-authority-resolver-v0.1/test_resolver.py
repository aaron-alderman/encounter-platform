"""Check authority failure cases outside the scored holdout."""
from copy import deepcopy
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from resolver import AuthorityArchive, DOCS, HERE, digest


class AuthorityBoundary(unittest.TestCase):
    def setUp(self):
        self.bindings = json.loads((HERE / "archive-bindings.json").read_text())
        self.archive = AuthorityArchive(DOCS, self.bindings)
        self.action = "IAC3/typed-bridge"
        self.binding = self.bindings["decisions"][self.action]

    def test_future_approval_unavailable_even_if_files_exist(self):
        before = self.archive.resolve(self.action, "IAC3-review")
        after = self.archive.resolve(self.action, "IAC3-decision")
        self.assertEqual(before["decision"], "pending")
        self.assertEqual(before["citation"]["record"], self.binding["review"])
        self.assertEqual(after["decision"], "approved")
        self.assertEqual(after["citation"]["record"], self.binding["ledger"])

    def test_adjacent_approval_does_not_grant_scope(self):
        for action, checkpoint in (("IAC3/near-miss-mapping", "IAC3-decision"),
                                   ("IAC2/fixture-02-resolution", "IAC2-decision")):
            with self.subTest(action=action):
                self.assertEqual(self.archive.resolve(action, checkpoint)["decision"], "pending")
        for action, checkpoint in (("IAC3/unregistered", "IAC3-decision"),
                                   (self.action, "latest")):
            with self.subTest(action=action, checkpoint=checkpoint):
                answer = self.archive.resolve(action, checkpoint)
                self.assertEqual(answer["decision"], "unresolved")
                self.assertIsNone(answer["citation"])

    def test_missing_or_corrupt_receipt_abstains_without_citation(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for role in ("review", "directive", "ledger"):
                shutil.copyfile(DOCS / self.binding[role], root / self.binding[role])
            archive = AuthorityArchive(root, self.bindings)
            self.assertEqual(archive.resolve(self.action, "IAC3-review")["decision"], "pending")
            answer = archive.resolve(self.action, "IAC3-decision")
            self.assertEqual(answer["decision"], "unresolved")
            self.assertIsNone(answer["citation"])
            (root / self.binding["receipt"]).write_text("{}")
            answer = archive.resolve(self.action, "IAC3-decision")
            self.assertEqual(answer["decision"], "unresolved")
            self.assertIn("Digest mismatch", answer["reason"])

    def test_receipt_with_wrong_ledger_hash_abstains_even_if_manifest_pins_it(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for role in ("review", "directive", "ledger"):
                shutil.copyfile(DOCS / self.binding[role], root / self.binding[role])
            name = self.binding["receipt"]
            receipt = json.loads((DOCS / name).read_text())
            receipt["outputs"][self.binding["ledger"]] = "sha256:" + "0" * 64
            raw = json.dumps(receipt).encode()
            (root / name).write_bytes(raw)
            bindings = deepcopy(self.bindings)
            bindings["catalog"][name]["sha256"] = digest(raw)
            answer = AuthorityArchive(root, bindings).resolve(self.action, "IAC3-decision")
            self.assertEqual(answer["decision"], "unresolved")
            self.assertIsNone(answer["citation"])
            self.assertIn("Unbound", answer["reason"])


if __name__ == "__main__":
    unittest.main()
