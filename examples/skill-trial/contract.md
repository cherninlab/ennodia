# Retry delay contract

- A missing value uses 30 seconds.
- A decimal integer from 0 through 120 specifies the delay in seconds.
- Zero is valid and means retry immediately.
- Empty values, whitespace, fractions, negative values, and values over 120 use 30 seconds.
- The function must not accept numeric notation such as `1e2` or `0x10`.
