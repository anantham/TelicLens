#include <stdio.h>
#include <stdint.h>

int process_heartbeat(const uint8_t *msg, size_t msg_len, uint8_t *out);
int process_heartbeat_hardened(const uint8_t *msg, size_t msg_len, uint8_t *out);

int main(void) {
    uint8_t hb[8];
    uint8_t out[1024];

    // Craft a heartbeat that declares a larger payload than provided.
    hb[0] = 1;
    hb[1] = 0x40; // claimed len high byte (0x4000)
    hb[2] = 0x00; // claimed len low byte
    hb[3] = 'O';
    hb[4] = 'K';

    int copied = process_heartbeat(hb, 5, out);
    printf("Copied %d bytes (default path)\n", copied);

    copied = process_heartbeat_hardened(hb, 5, out);
    printf("Copied %d bytes (hardened path)\n", copied);
    return 0;
}
