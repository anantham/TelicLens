#include <stdint.h>
#include <string.h>

#define MAX_HEARTBEAT 65535

// Telos: Safely echo heartbeat payloads to prove liveness without leaking memory.
// BUG: Missing bounds check (Heartbleed-style). An attacker can over-read past msg.
int process_heartbeat_vuln(const uint8_t *msg, size_t msg_len, uint8_t *out) {
    if (msg_len < 3) return -1; // type(1) + len(2)
    uint16_t payload_len = (msg[1] << 8) | msg[2]; // attacker controlled
    const uint8_t *payload = msg + 3;

    // BUG: does not verify payload_len <= msg_len - 3
    // memcpy will copy attacker-chosen length from beyond payload into out.
    if (payload_len > MAX_HEARTBEAT) return -1; // only size cap, not bounds
    memcpy(out, payload, payload_len);          // ← potential over-read
    return payload_len;
}

// Helper to craft a malicious heartbeat (for reference)
// Sends a small payload but claims a large length to force over-read.
void craft_malicious_heartbeat(uint8_t *buf, uint16_t claimed_len) {
    buf[0] = 1; // heartbeat type
    buf[1] = (claimed_len >> 8) & 0xff;
    buf[2] = claimed_len & 0xff;
    buf[3] = 'O'; buf[4] = 'K'; // real payload (2 bytes)
}
