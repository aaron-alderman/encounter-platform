# Sourcery platform

Git source owner for the non-application Sourcery platform and shell.

This repository begins as an inert boundary and provenance closure. It contains no executable source, selected runtime, credential, application asset, deployment path or production authority.

The initial repository keeps three semantic packages together because they currently share one source and qualification lifecycle:

- `packages/kernel`: minimal imperative mechanisms behind typed ports;
- `packages/platform`: algebraic platform state and transition semantics;
- `packages/shell`: algebraic MCP, session and human-surface composition.

The packages are distinct; their repository machinery is shared. A package moves to an independent repository only when an independently governed release, admission, custody or consumer lifecycle is observed.

Existing accepted owners remain external dependencies:

- `claimipedia-core` owns shared expression/process interpreters, fixed codecs and byte mechanisms;
- `qualification-runner` owns bounded execution and qualification receipts;
- `git-receiving` owns generic comparison and exact byte receiving.

Temple snapshots are migration evidence and possible immutable artifact inputs. Git commits, packages and CI receipts are the durable source/provenance path for this repository. Receiving, qualification, merge, adoption, activation, serving, writer handover, retirement and publication remain separate facts.

