#include <stdint.h>
#include <string.h>

#define MAX_HEARTBEAT 65535

// Fixed version with proper bounds checking.
int process_heartbeat_safe(const uint8_t *msg, size_t msg_len, uint8_t *out) {
    if (msg_len < 3) return -1;
    uint16_t payload_len = (msg[1] << 8) | msg[2];
    if (payload_len > MAX_HEARTBEAT) return -1;
    if (payload_len > msg_len - 3) return -1; // critical check
    memcpy(out, msg + 3, payload_len);
    return payload_len;
}
