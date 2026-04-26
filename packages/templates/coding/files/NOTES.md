# Project ideas

This file is your idea backlog. The `build-project` workflow reads it, picks the most compelling unfinished idea, and builds the whole project end-to-end. After a successful build the idea is plucked from this file automatically.

Edit, replace, or extend the list below.

## Ideas

- A CLI that converts markdown tables to CSV. Reads from stdin or a file path, writes CSV to stdout. Single command, handles multi-line cells.
- A clipboard-to-QR-code generator. Takes the current clipboard contents and prints a scannable QR code to the terminal using ANSI block characters.
- A countdown timer for the terminal. `countdown 5m` prints a single self-updating line until it hits zero, then beeps. Accepts `30s`, `5m`, `1h30m` style durations.
- A password generator with configurable length and class flags (`--no-symbols`, `--length 32`). Cryptographically secure source. Prints one password per line.
- A URL health checker. Reads a list of URLs from a file, hits each with a HEAD request in parallel, prints `URL  STATUS  LATENCY` one line each. Exits non-zero if any check fails.
