# TelicLens Test Fixture: Heartbeat Overread (Heartbleed-Style)

Purpose: Provide a small, coherent code sample with a latent over-read bug so you can test whether TelicLens surfaces bad intent/misalignment in the graph.

System telos (stated intent):
- Securely handle client heartbeat messages for a chat-like service.
- Reject malformed input and never leak memory.

Files:
- `vuln_heartbeat.c`: Vulnerable heartbeat handler (missing bounds check, Heartbleed-style).
- `fixed_heartbeat.c`: Patched handler with proper length validation.
- `main.c`: Minimal harness showing intended use and telos comments.

How to use:
1) Load this `test/` folder into TelicLens.
2) Inspect `vuln_heartbeat.c` — look for the flow from client input to `memcpy` without verifying `payload_len <= msg_len - 3`.
3) Compare with `fixed_heartbeat.c` to see the intended safe flow.
4) In the Telic view, the handler should serve the “Protect Session Integrity” telos; the vulnerable edge should be marked undermining/contradictory.
