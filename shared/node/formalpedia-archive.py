"""Stream verified Lean headers and export index rows without extracting an archive."""
import hashlib
import json
import re
import sys
import tarfile

HEADER_LIMIT = 2 * 1024 * 1024

def lean_header(source):
    # Find a command boundary outside comments. The Node parser handles the
    # import grammar, including continuations and exact quoted module names.
    token = re.compile(rb"--|/-|-/|^(?:set_option|open|namespace|section|theorem|lemma|def|noncomputable|variable|attribute)\s", re.M)
    depth = 0
    position = 0
    while match := token.search(source, position):
        position = match.end()
        value = match.group()
        if value == b"--" and not depth:
            newline = source.find(b"\n", position)
            position = len(source) if newline < 0 else newline + 1
        elif value == b"/-":
            depth += 1
        elif value == b"-/" and depth:
            depth -= 1
        elif not depth and not value.startswith(b"--") and value != b"-/":
            return source[:match.end()], True
    return source, False

def scan(filename, commit):
    prefix = f"formalpedia-{commit}/"
    with tarfile.open(filename, "r|gz", bufsize=1024 * 1024) as archive:
        for member in archive:
            if not member.isfile() or not member.name.startswith(prefix):
                continue
            path = member.name[len(prefix):]
            if re.fullmatch(r"envs/[a-f0-9]{7}/Solutions/[^/]+\.lean", path):
                source = archive.extractfile(member)
                header = source.read(HEADER_LIMIT)
                digest = hashlib.sha256(header)
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    digest.update(chunk)
                preamble, complete = lean_header(header)
                yield ["solution", path, digest.hexdigest(), preamble.decode("utf-8"),
                       not complete and member.size > len(header)]
            elif re.fullmatch(r"envs/[a-f0-9]{7}/index-\d+\.jsonl", path):
                for line in archive.extractfile(member):
                    row = json.loads(line)
                    yield ["record", row["env"] + "-" + row["id"], row["statement_path"]]

if __name__ == "__main__":
    for row in scan(*sys.argv[1:]):
        print(json.dumps(row))
