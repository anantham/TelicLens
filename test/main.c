#include <stdio.h>

int run_gateway_demo(void);

int main(void) {
    int copied = run_gateway_demo();
    printf("Gateway demo copied: %d bytes\n", copied);
    return 0;
}
