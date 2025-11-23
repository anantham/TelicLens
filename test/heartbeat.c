#include <stdint.h>
#include <string.h>

#define MAX_HEARTBEAT 65535

// Default handler: echoes heartbeat payloads for liveness checks.
// Intended telos: prove session liveness without leaking memory.
int process_heartbeat(const uint8_t *msg, size_t msg_len, uint8_t *out) {
    if (msg_len < 3) return -1; // type(1) + len(2)
    uint16_t payload_len = (msg[1] << 8) | msg[2];
    const uint8_t *payload = msg + 3;

    // NOTE: Size cap, but no check that payload_len <= msg_len - 3
    if (payload_len > MAX_HEARTBEAT) return -1;

    // Potential over-read if payload_len > (msg_len - 3)
    memcpy(out, payload, payload_len);
    return payload_len;
}

// Hardened handler: validates the declared length against the actual buffer.
int process_heartbeat_hardened(const uint8_t *msg, size_t msg_len, uint8_t *out) {
    if (msg_len < 3) return -1;
    uint16_t payload_len = (msg[1] << 8) | msg[2];
    if (payload_len > MAX_HEARTBEAT) return -1;
    if (payload_len > msg_len - 3) return -1; // critical bounds check
    memcpy(out, msg + 3, payload_len);
    return payload_len;
}
