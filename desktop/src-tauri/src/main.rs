// Stops an extra console window opening on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    oatcake_lib::run()
}
