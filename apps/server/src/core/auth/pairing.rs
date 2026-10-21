//! Limits short-lived pairing codes to five incorrect attempts per minute.

use std::{
    fmt,
    time::{Duration, Instant},
};
use subtle::ConstantTimeEq;

pub(crate) struct PairingCode {
    code: String,
    issued: Instant,
    window: Instant,
    failures: u8,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum PairingResult {
    Accepted,
    Rejected,
    Expired,
    Limited,
}

impl fmt::Debug for PairingCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("PairingCode([REDACTED])")
    }
}

impl PairingCode {
    pub(crate) fn new(value: u32, now: Instant) -> Self {
        Self {
            code: format!("{:06}", value % 1_000_000),
            issued: now,
            window: now,
            failures: 0,
        }
    }

    pub(crate) fn text(&self) -> &str {
        &self.code
    }

    pub(crate) fn expired(&self, now: Instant) -> bool {
        now.saturating_duration_since(self.issued) >= Duration::from_mins(10)
    }

    pub(crate) fn verify(&mut self, supplied: &str, now: Instant) -> PairingResult {
        if self.expired(now) {
            return PairingResult::Expired;
        }
        if now.saturating_duration_since(self.window) >= Duration::from_mins(1) {
            self.window = now;
            self.failures = 0;
        }
        if self.failures >= 5 {
            return PairingResult::Limited;
        }
        if bool::from(self.code.as_bytes().ct_eq(supplied.as_bytes())) {
            return PairingResult::Accepted;
        }
        self.failures += 1;
        PairingResult::Rejected
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_keep_leading_zeroes_and_expire_after_ten_minutes() {
        let now = Instant::now();
        let mut code = PairingCode::new(42, now);
        assert_eq!(code.text(), "000042");
        assert_eq!(code.verify("000042", now), PairingResult::Accepted);
        assert_eq!(code.verify("42", now), PairingResult::Rejected);
        assert_eq!(
            code.verify("000042", now + Duration::from_mins(10)),
            PairingResult::Expired
        );
        assert!(!format!("{code:?}").contains("000042"));
    }

    #[test]
    fn guessing_is_limited_even_with_the_correct_code_during_cooldown() {
        let now = Instant::now();
        let mut code = PairingCode::new(42, now);
        for _ in 0..5 {
            assert_eq!(code.verify("000000", now), PairingResult::Rejected);
        }
        assert_eq!(code.verify("000042", now), PairingResult::Limited);
        assert_eq!(
            code.verify("000042", now + Duration::from_mins(1)),
            PairingResult::Accepted
        );
    }
}
