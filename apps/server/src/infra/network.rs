//! Discovers the machine's private IPv4 interfaces without contacting external services.

use network_interface::{Addr, NetworkInterface, NetworkInterfaceConfig};

pub(crate) fn hosts(port: u16) -> Vec<String> {
    let mut hosts: Vec<_> = NetworkInterface::show()
        .unwrap_or_default()
        .into_iter()
        .filter(|interface| !interface.internal)
        .flat_map(|interface| interface.addr)
        .filter_map(|address| match address {
            Addr::V4(address)
                if (address.ip.is_private() || address.ip.is_link_local())
                    && address.netmask.is_none_or(|mask| {
                        let host_mask = !u32::from(mask);
                        let host = u32::from(address.ip) & host_mask;
                        host_mask <= 1 || (host != 0 && host != host_mask)
                    }) =>
            {
                Some(format!("{}:{port}", address.ip))
            }
            _ => None,
        })
        .collect();
    hosts.sort();
    hosts.dedup();
    hosts
}
