//! Tracks embedded `SQLite` migration inputs.

fn main() {
    println!("cargo::rerun-if-changed=migrations");
}
