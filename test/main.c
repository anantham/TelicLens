#include <stdio.h>
#include <stdint.h>

int process_heartbeat_vuln(const uint8_t *msg, size_t msg_len, uint8_t *out);
int process_heartbeat_safe(const uint8_t *msg, size_t msg_len, uint8_t *out);

// Telos: Protect session integrity while proving liveness.
// This harness calls the vulnerable version to illustrate risk.
int main(void) {
    uint8_t hb[8];
    uint8_t out[1024];

    // Craft a malicious heartbeat: claims length 32k, sends 2 bytes.
    hb[0] = 1;
    hb[1] = 0x80; // claimed len high byte
    hb[2] = 0x00; // claimed len low byte
    hb[3] = 'O';
    hb[4] = 'K';

    int copied = process_heartbeat_vuln(hb, 5, out);
    printf("Copied %d bytes (vuln)\n", copied);

    // Safe path (unreachable in this demo but provided for comparison)
    copied = process_heartbeat_safe(hb, 5, out);
    printf("Copied %d bytes (safe)\n", copied);
    return 0;
}
