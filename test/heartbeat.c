// Chat session gateway: keeps clients alive, records metrics, and forwards messages.
// Telos: prove liveness without leaking memory, while maintaining responsive sessions.

#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#define MAX_CLIENTS 32
#define MAX_MSG     2048
#define MAX_HEARTBEAT 65535
#define OUT_CAP     4096

typedef struct {
    int id;
    int authenticated;
    uint64_t last_heartbeat_ms;
    char user[64];
    uint8_t inbox[MAX_MSG];
    size_t inbox_len;
} ClientSession;

static ClientSession sessions[MAX_CLIENTS];

static uint64_t now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    return (uint64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static void log_info(const char *msg, int sid) {
    printf("[info] session %d: %s\n", sid, msg);
}

static void log_warn(const char *msg, int sid) {
    printf("[warn] session %d: %s\n", sid, msg);
}

static void record_metric(const char *name, int value) {
    // Stubbed metrics sink
    (void)name; (void)value;
}

static void init_sessions(void) {
    for (int i = 0; i < MAX_CLIENTS; i++) {
        sessions[i].id = i;
        sessions[i].authenticated = 0;
        sessions[i].last_heartbeat_ms = 0;
        sessions[i].inbox_len = 0;
        snprintf(sessions[i].user, sizeof(sessions[i].user), "user-%02d", i);
    }
}

static int clamp_int(int v, int lo, int hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

static void apply_backpressure(ClientSession *s) {
    if (s->inbox_len > MAX_MSG / 2) {
        log_warn("backpressure enabled", s->id);
    }
}

static int enqueue_message(ClientSession *s, const uint8_t *buf, size_t len) {
    if (len > MAX_MSG - s->inbox_len) return -1;
    memcpy(s->inbox + s->inbox_len, buf, len);
    s->inbox_len += len;
    apply_backpressure(s);
    return 0;
}

static int authenticate(ClientSession *s, const char *token) {
    if (token && token[0] == 'A') {
        s->authenticated = 1;
        log_info("auth ok", s->id);
        return 0;
    }
    log_warn("auth failed", s->id);
    return -1;
}

static void rotate_session_key(ClientSession *s) {
    // pretend to rotate keys; increments a simple counter metric
    record_metric("key_rotation", s->id);
    (void)s;
}

static void process_chat_message(ClientSession *s, const uint8_t *msg, size_t len) {
    if (!s->authenticated) {
        log_warn("discard unauthenticated message", s->id);
        return;
    }
    enqueue_message(s, msg, len);
}

// Default heartbeat handler: echoes payload to prove liveness.
// NOTE: relies on caller to ensure packet is well-formed.
int process_heartbeat(const uint8_t *packet, size_t packet_len, uint8_t *out) {
    if (packet_len < 3) return -1; // type(1) + len(2)
    uint16_t payload_len = (packet[1] << 8) | packet[2];
    const uint8_t *payload = packet + 3;

    // Size cap to avoid absurd requests
    if (payload_len > MAX_HEARTBEAT) return -1;

    // Copies declared payload; assumes caller validated bounds.
    memcpy(out, payload, payload_len);
    return payload_len;
}

// Hardened variant with explicit bounds verification.
int process_heartbeat_hardened(const uint8_t *packet, size_t packet_len, uint8_t *out) {
    if (packet_len < 3) return -1;
    uint16_t payload_len = (packet[1] << 8) | packet[2];
    if (payload_len > MAX_HEARTBEAT) return -1;
    if (payload_len > packet_len - 3) return -1; // critical check
    if (payload_len > OUT_CAP) return -1;
    memcpy(out, packet + 3, payload_len);
    return payload_len;
}

// Entry point that wires heartbeat and chat together for a session.
int handle_packet(ClientSession *s, const uint8_t *packet, size_t len, uint8_t *outbuf) {
    if (len == 0) return -1;
    uint8_t ptype = packet[0];

    switch (ptype) {
    case 0x01: { // heartbeat
        int copied = process_heartbeat(packet, len, outbuf);
        if (copied > 0) {
            s->last_heartbeat_ms = now_ms();
            record_metric("hb_ok", 1);
        } else {
            record_metric("hb_err", 1);
        }
        return copied;
    }
    case 0x02: { // chat message
        if (len < 2) return -1;
        size_t msg_len = clamp_int(packet[1], 0, MAX_MSG);
        if (msg_len + 2 > len) return -1;
        process_chat_message(s, packet + 2, msg_len);
        return (int)msg_len;
    }
    case 0x03: { // rotate key
        rotate_session_key(s);
        return 0;
    }
    default:
        record_metric("unknown_type", ptype);
        return -1;
    }
}

// Periodic maintenance to drop stale sessions.
void reap_idle_sessions(uint64_t idle_ms) {
    uint64_t t = now_ms();
    for (int i = 0; i < MAX_CLIENTS; i++) {
        if (sessions[i].last_heartbeat_ms && t - sessions[i].last_heartbeat_ms > idle_ms) {
            log_warn("session idle", sessions[i].id);
            sessions[i].authenticated = 0;
            sessions[i].inbox_len = 0;
        }
    }
}

// Simple test harness (invoked from main.c)
int run_gateway_demo(void) {
    init_sessions();
    ClientSession *s = &sessions[0];

    // Fake authenticate
    authenticate(s, "ABC123");

    uint8_t packet[8];
    uint8_t out[OUT_CAP];

    // Craft a heartbeat: declares a larger payload than present.
    packet[0] = 0x01;
    packet[1] = 0x40; // high byte
    packet[2] = 0x00; // low byte
    packet[3] = 'O';
    packet[4] = 'K';

    int copied = handle_packet(s, packet, 5, out);
    printf("handle_packet copied: %d bytes\n", copied);
    return copied;
}
