# TelicLens Test Fixture: Heartbeat Overread (Heartbleed-Style)

Purpose: Provide a small, coherent code sample with a latent over-read bug so you can test whether TelicLens surfaces bad intent/misalignment in the graph—without obvious hints in code.

System telos (stated intent):
- Securely handle client heartbeat messages for a chat-like service.
- Reject malformed input and never leak memory.

Files:
- `heartbeat.c`: Contains both the vulnerable handler (missing a bounds check, Heartbleed-style) and a fixed variant.
- `main.c`: Minimal harness showing intended use and telos comments.

How to use:
1) Load this `test/` folder into TelicLens.
2) Inspect `heartbeat.c` — trace the flow from client input to copy; ensure the length check matches the actual buffer size.
3) Compare the code paths to see the intended safe flow.
4) In Telic view, the handler should serve the “Protect Session Integrity” telos; the bad edge should be marked undermining/contradictory.
