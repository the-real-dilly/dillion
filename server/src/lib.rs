//! DILLION: LAST ZONE - self-hosted authoritative match server.
//! `world`, `sim` and `bots` are ports of last-zone/world.js, sim.js and bots.js;
//! `data` is generated from last-zone/data.js by tools/gen_data.mjs.
#![forbid(unsafe_code)]
pub mod bots;
pub mod data;
pub mod proto;
pub mod rng;
pub mod room;
pub mod server;
pub mod sim;
pub mod world;
