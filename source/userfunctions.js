addDevice = function(deviceName, deviceModel, x, y) {
    var deviceType = allDeviceTypes[deviceModel];
    var originalDeviceName = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace().addDevice(deviceType, deviceModel, x, y);

    if (!originalDeviceName) { return false; }

    var device = ipc.network().getDevice(originalDeviceName);
    device.setName(deviceName);

    if (deviceType <= 1 || deviceType == 16) {
        device.skipBoot();
    }

    return true;
}

addModule = function(deviceName, slot, model) {
    var device = ipc.network().getDevice(deviceName);

    var powerState = device.getPower();
    device.setPower(false);

    var moduleType = allModuleTypes[model];
    var result = device.addModule(slot, moduleType, model);

    if (powerState) {
        device.setPower(true);
        var deviceType = device.getType();
        if (deviceType <= 1 || deviceType == 16) {
            device.skipBoot();
        }
    }

    if (result != true) { return false; }

    return true;
}

addLink = function(device1Name, device1Interface, device2Name, device2Interface, linkType) {
    var linkType = allLinkTypes[linkType];
    var result = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace().createLink(device1Name, device1Interface, device2Name, device2Interface, linkType);
    if (result != true) { return false; }

    return true;
}

configurePcIp = function(deviceName, dhcpEnabled, ipaddress, subnetMask, defaultGateway, dnsServer) {
    var device = ipc.network().getDevice(deviceName);
    if (!device) return false;
    
    var port = device.getPort("FastEthernet0");
    if (!port) {
        var portCount = device.getPortCount();
        for (var i = 0; i < portCount; i++) {
            var p = device.getPortAt(i);
            if (p.getName().indexOf("FastEthernet") === 0) {
                port = p;
                break;
            }
        }
    }
    if (!port) return false;
    
    if (dhcpEnabled) device.setDhcpFlag(dhcpEnabled);
    if (ipaddress && subnetMask) port.setIpSubnetMask(ipaddress, subnetMask);
    if (defaultGateway) port.setDefaultGateway(defaultGateway);
    if (dnsServer) port.setDnsServerIp(dnsServer);
    return true;
}

configureIosDevice = function(deviceName, commands) {
    var device = ipc.network().getDevice(deviceName);
    var deviceType = device.getType();
    if (deviceType <= 1 || deviceType == 16) {
        device.skipBoot();
    }
    var commandsArray = commands.split("\n");
    device.enterCommand("!", "global");
    for (var ci = 0; ci < commandsArray.length; ci++) {
        device.enterCommand(commandsArray[ci], "");
    }
    device.enterCommand("write memory", "enable");
}

var deviceTypes = {
    router: 0,
    switch: 1,
    cloud: 2,
    bridge: 3,
    hub: 4,
    repeater: 5,
    coaxialsplitter: 6,
    accesspoint: 7,
    pc: 8,
    server: 9,
    printer: 10,
    wirelessrouter: 11,
    ipphone: 12,
    dslmodem: 13,
    cablemodem: 14,
    remotenetwork: 15,
    multilayerswitch: 16,
    laptop: 17,
    tabletpc: 18,
    pda: 19,
    wirelessenddevice: 20,
    wiredenddevice: 21,
    tv: 22,
    homevoip: 23,
    analogphone: 24,
    multiuser: 25,
    asa: 26,
    ioe: 27,
    homegateway: 28,
    celltower: 29,
    ciscoaccesspoint: 30,
    centralofficeserver: 31,
    embeddedciscoaccesspoint: 32,
    sniffer: 33,
    mcu: 34,
    sbc: 35,
    thing: 36,
    mcucomponent: 37,
    embeddedserver: 38
}

function getDevices(filter = undefined, startsWith = "") {
    if (filter) {
        if (typeof filter == "string") { filter = [filter]; }
        if (typeof filter == "number") { filter = [filter]; }
        for (var i = 0; i < filter.length; i++) {
            if (typeof filter[i] == "string") {
                filter[i] = deviceTypes[filter[i].toLowerCase()];
            }
        }
    }
    var deviceCount = ipc.network().getDeviceCount();
    var devices = [];
    for (var i = 0; i < deviceCount; i++) {
        var device = ipc.network().getDeviceAt(i);
        var deviceName = device.getName();
        var deviceType = device.getType();
        if ((!filter || filter.indexOf(deviceType) !== -1) && deviceName.indexOf(startsWith) === 0) {
            devices.push(deviceName);
        }
    }
    return devices;
}

getDeviceInfo = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { error: "Device not found" };

        var info = {
            name: device.getName(),
            model: device.getModel(),
            type: device.getType(),
            ports: []
        };

        var portCount = device.getPortCount();
        for (var i = 0; i < portCount; i++) {
            var port = device.getPortAt(i);
            var portInfo = {
                name: port.getName(),
                type: port.getType(),
                up: port.isUp(),
                ip: port.getIpAddress(),
                subnet: port.getSubnetMask(),
                mac: port.getMacAddress()
            };
            info.ports.push(portInfo);
        }
        return info;
    } catch(e) {
        return { error: e.toString() };
    }
}

getNetworkStatus = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var status = [];
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var dInfo = {
                name: d.getName(),
                type: d.getType(),
                activePorts: 0,
                ips: []
            };
            
            var pc = d.getPortCount();
            for (var j = 0; j < pc; j++) {
                var p = d.getPortAt(j);
                if (p.isUp()) dInfo.activePorts++;
                var ip = p.getIpAddress();
                if (ip && ip !== "0.0.0.0") dInfo.ips.push(ip);
            }
            status.push(dInfo);
        }
        return status;
    } catch(e) {
        return { error: e.toString() };
    }
}

testConnectivity = function(sourceName, destIp) {
    // NOTE: This checks IP existence and port UP state — it does NOT run an actual
    // simulation ping. Use this to verify IP assignment, not routing correctness.
    try {
        var srcDevice = ipc.network().getDevice(sourceName);
        if (!srcDevice) return { success: false, error: "Source device not found" };

        var deviceCount = ipc.network().getDeviceCount();
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var pc = d.getPortCount();
            for (var j = 0; j < pc; j++) {
                var p = d.getPortAt(j);
                if (p.getIpAddress() === destIp && p.isUp()) {
                    return {
                        success: true,
                        destDevice: d.getName(),
                        destPort: p.getName(),
                        note: "IP found and port is UP. This is an IP existence check, not a simulation ping."
                    };
                }
            }
        }
        return { success: false, output: "Destination IP " + destIp + " not found or port is down." };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}

removeDevice = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found" };
        
        ipc.appWindow().getActiveWorkspace().getLogicalWorkspace().removeDevice(deviceName);
        return { success: true };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}

removeLink = function(deviceName, portName) {
    try {
        var workspace = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
        var links = workspace.getLinks();
        
        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            var d1 = link.getDevice1Name();
            var p1 = link.getInterface1Name();
            if (d1 === deviceName && p1 === portName) {
                workspace.removeLink(link);
                return { success: true };
            }
            var d2 = link.getDevice2Name();
            var p2 = link.getInterface2Name();
            if (d2 === deviceName && p2 === portName) {
                workspace.removeLink(link);
                return { success: true };
            }
        }
        return { success: false, error: "Link not found" };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}

getLinks = function() {
    try {
        var workspace = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
        var links = workspace.getLinks();
        var linkList = [];
        
        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            linkList.push({
                device1: link.getDevice1Name(),
                port1: link.getInterface1Name(),
                device2: link.getDevice2Name(),
                port2: link.getInterface2Name(),
                type: link.getLinkType()
            });
        }
        return linkList;
    } catch(e) {
        return { error: e.toString() };
    }
}

// ---------------------------------------------------------------------------
// Agent-optimized query functions
// ---------------------------------------------------------------------------

// One-shot full canvas snapshot. Use INSTEAD of combining list_devices +
// get_network_status + list_connections — saves 2 round-trips per agent turn.
getTopologySummary = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var workspace = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
        var linkObjects = workspace.getLinks();
        var links = [];
        for (var k = 0; k < linkObjects.length; k++) {
            var lnk = linkObjects[k];
            links.push({
                from: lnk.getDevice1Name() + ":" + lnk.getInterface1Name(),
                to:   lnk.getDevice2Name() + ":" + lnk.getInterface2Name()
            });
        }
        var devices = [];
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var dInfo = { name: d.getName(), model: d.getModel(), type: d.getType(), ports: [] };
            var pc = d.getPortCount();
            for (var j = 0; j < pc; j++) {
                var p = d.getPortAt(j);
                var pInfo = { name: p.getName(), up: p.isUp() };
                var ip = p.getIpAddress();
                if (ip && ip !== "0.0.0.0") {
                    pInfo.ip = ip;
                    pInfo.subnet = p.getSubnetMask();
                    pInfo.mac = p.getMacAddress();
                }
                dInfo.ports.push(pInfo);
            }
            devices.push(dInfo);
        }
        return { deviceCount: deviceCount, linkCount: links.length, devices: devices, links: links };
    } catch(e) { return { error: e.toString() }; }
}

// Quick boolean existence check — use before add/configure to avoid errors.
checkDeviceExists = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return false;
        return device.getName() === deviceName;
    } catch(e) { return false; }
}

// Returns which ports are free vs used — use before pt_connect to pick a valid port.
getAvailablePorts = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { error: "Device not found: " + deviceName };
        var workspace = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
        var linkObjects = workspace.getLinks();
        var usedPorts = {};
        for (var k = 0; k < linkObjects.length; k++) {
            var lnk = linkObjects[k];
            if (lnk.getDevice1Name() === deviceName) usedPorts[lnk.getInterface1Name()] = true;
            if (lnk.getDevice2Name() === deviceName) usedPorts[lnk.getInterface2Name()] = true;
        }
        var available = [];
        var used = [];
        var portCount = device.getPortCount();
        for (var i = 0; i < portCount; i++) {
            var port = device.getPortAt(i);
            var portName = port.getName();
            if (usedPorts[portName]) { used.push(portName); } else { available.push(portName); }
        }
        return { device: deviceName, available: available, used: used, totalPorts: portCount };
    } catch(e) { return { error: e.toString() }; }
}

// Returns the neighbors of a device: {localPort, remoteDevice, remotePort}.
getConnectedDevices = function(deviceName) {
    try {
        var workspace = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
        var linkObjects = workspace.getLinks();
        var connections = [];
        for (var k = 0; k < linkObjects.length; k++) {
            var lnk = linkObjects[k];
            if (lnk.getDevice1Name() === deviceName) {
                connections.push({ localPort: lnk.getInterface1Name(), remoteDevice: lnk.getDevice2Name(), remotePort: lnk.getInterface2Name() });
            } else if (lnk.getDevice2Name() === deviceName) {
                connections.push({ localPort: lnk.getInterface2Name(), remoteDevice: lnk.getDevice1Name(), remotePort: lnk.getInterface1Name() });
            }
        }
        return { device: deviceName, connections: connections };
    } catch(e) { return { error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// VLAN Management Functions
// ---------------------------------------------------------------------------

createVlan = function(switchName, vlanId, vlanName) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        var deviceType = device.getType();
        if (deviceType !== 1 && deviceType !== 16) {
            return { success: false, error: "Device is not a switch (type " + deviceType + ")" };
        }
        
        device.skipBoot();
        var commands = [
            "vlan " + vlanId,
            "name " + vlanName,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, vlanId: vlanId, vlanName: vlanName };
    } catch(e) { return { success: false, error: e.toString() }; }
}

deleteVlan = function(switchName, vlanId) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        device.enterCommand("no vlan " + vlanId, "");
        
        return { success: true, vlanId: vlanId };
    } catch(e) { return { success: false, error: e.toString() }; }
}

assignPortVlan = function(switchName, portName, vlanId, mode) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        mode = mode || "access";
        
        if (mode !== "access") {
            return { success: false, error: "Use setPortTrunk() for trunk mode configuration" };
        }
        
        var commands = [
            "interface " + portName,
            "switchport mode access",
            "switchport access vlan " + vlanId,
            "spanning-tree portfast",
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, port: portName, vlanId: vlanId, mode: "access" };
    } catch(e) { return { success: false, error: e.toString() }; }
}

setPortAccessVlan = function(switchName, portName, vlanId) {
    return assignPortVlan(switchName, portName, vlanId, "access");
}

setPortTrunk = function(switchName, portName, allowedVlans) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        allowedVlans = allowedVlans || "all";
        
        var commands = [
            "interface " + portName,
            "switchport mode trunk",
            "switchport trunk allowed vlan " + allowedVlans,
            "switchport trunk native vlan 1",
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, port: portName, allowedVlans: allowedVlans };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureVtp = function(switchName, mode, domain, password) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        mode = mode || "server";
        domain = domain || "corp";
        
        var commands = [
            "vtp mode " + mode,
            "vtp domain " + domain
        ];
        
        if (password) {
            commands.push("vtp password " + password);
        }
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, mode: mode, domain: domain };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureInterVlanRouting = function(routerName, vlanId, ipAddress, subnetMask) {
    try {
        var device = ipc.network().getDevice(routerName);
        if (!device) return { success: false, error: "Router not found: " + routerName };
        
        device.skipBoot();
        
        var commands = [
            "interface GigabitEthernet0/" + vlanId,
            "no shutdown",
            "ip address " + ipAddress + " " + subnetMask,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, router: routerName, vlanId: vlanId, ipAddress: ipAddress };
    } catch(e) { return { success: false, error: e.toString() }; }
}

getSwitchVlans = function(switchName) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { error: "Switch not found: " + switchName };
        
        var portCount = device.getPortCount();
        var vlans = {};
        
        for (var i = 0; i < portCount; i++) {
            var port = device.getPortAt(i);
            var portName = port.getName();
            if (portName.indexOf("FastEthernet") === 0 || portName.indexOf("GigabitEthernet") === 0) {
                if (port.getVlan && typeof port.getVlan === "function") {
                    var vlan = port.getVlan();
                    if (vlan !== null && vlan !== undefined) {
                        if (!vlans[vlan]) vlans[vlan] = [];
                        vlans[vlan].push({ port: portName, up: port.isUp() });
                    }
                }
            }
        }
        
        return { switch: switchName, vlans: vlans };
    } catch(e) { return { error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// Improved Network Canvas Reading Tools
// ---------------------------------------------------------------------------

getDetailedTopology = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var workspace = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
        var linkObjects = workspace.getLinks();
        
        var switches = [];
        var routers = [];
        var hosts = [];
        var servers = [];
        var other = [];
        
        var deviceTypeNames = ["router", "switch", "cloud", "bridge", "hub", "repeater", 
                               "coaxialsplitter", "accesspoint", "pc", "server", "printer",
                               "wirelessrouter", "ipphone", "dslmodem", "cablemodem",
                               "remotenetwork", "multilayerswitch", "laptop", "tabletpc",
                               "pda", "wirelessenddevice", "wiredenddevice", "tv", "homevoip"];
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var dInfo = {
                name: d.getName(),
                model: d.getModel(),
                type: d.getType(),
                typeName: deviceTypeNames[d.getType()] || "unknown",
                moduleCount: d.getModuleCount ? d.getModuleCount() : 0,
                power: d.getPower ? d.getPower() : null,
                ports: []
            };
            
            var pc = d.getPortCount();
            for (var j = 0; j < pc; j++) {
                var p = d.getPortAt(j);
                var pInfo = {
                    name: p.getName(),
                    type: p.getType(),
                    up: p.isUp(),
                    vlan: p.getVlan ? p.getVlan() : null,
                    duplex: p.getDuplex ? p.getDuplex() : null,
                    speed: p.getSpeed ? p.getSpeed() : null,
                    ip: p.getIpAddress(),
                    subnet: p.getSubnetMask(),
                    mac: p.getMacAddress()
                };
                dInfo.ports.push(pInfo);
            }
            
            var dtype = d.getType();
            if (dtype === 1 || dtype === 16) switches.push(dInfo);
            else if (dtype === 0) routers.push(dInfo);
            else if (dtype === 8 || dtype === 17 || dtype === 18 || dtype === 19) hosts.push(dInfo);
            else if (dtype === 9) servers.push(dInfo);
            else other.push(dInfo);
        }
        
        var links = [];
        for (var k = 0; k < linkObjects.length; k++) {
            var lnk = linkObjects[k];
            links.push({
                from: lnk.getDevice1Name(),
                fromPort: lnk.getInterface1Name(),
                to: lnk.getDevice2Name(),
                toPort: lnk.getInterface2Name(),
                linkType: lnk.getLinkType()
            });
        }
        
        return {
            summary: {
                totalDevices: deviceCount,
                switchCount: switches.length,
                routerCount: routers.length,
                hostCount: hosts.length,
                serverCount: servers.length,
                linkCount: links.length
            },
            switches: switches,
            routers: routers,
            hosts: hosts,
            servers: servers,
            other: other,
            links: links
        };
    } catch(e) { return { error: e.toString() }; }
}

getNetworkSegments = function() {
    try {
        var workspace = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
        var linkObjects = workspace.getLinks();
        var segments = [];
        var visited = {};
        
        var adj = {};
        for (var k = 0; k < linkObjects.length; k++) {
            var lnk = linkObjects[k];
            var d1 = lnk.getDevice1Name();
            var d2 = lnk.getDevice2Name();
            if (!adj[d1]) adj[d1] = [];
            if (!adj[d2]) adj[d2] = [];
            adj[d1].push({ device: d2, port: lnk.getInterface1Name(), remotePort: lnk.getInterface2Name() });
            adj[d2].push({ device: d1, port: lnk.getInterface2Name(), remotePort: lnk.getInterface1Name() });
        }
        
        function bfs(start) {
            var queue = [start];
            var segment = [];
            visited[start] = true;
            
            while (queue.length > 0) {
                var current = queue.shift();
                segment.push(current);
                
                var neighbors = adj[current] || [];
                for (var i = 0; i < neighbors.length; i++) {
                    if (!visited[neighbors[i].device]) {
                        visited[neighbors[i].device] = true;
                        queue.push(neighbors[i].device);
                    }
                }
            }
            return segment;
        }
        
        var deviceCount = ipc.network().getDeviceCount();
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var name = d.getName();
            if (!visited[name]) {
                var segment = bfs(name);
                if (segment.length > 0) {
                    segments.push(segment);
                }
            }
        }
        
        return { segmentCount: segments.length, segments: segments };
    } catch(e) { return { error: e.toString() }; }
}

findPath = function(sourceName, destName) {
    try {
        var workspace = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
        var linkObjects = workspace.getLinks();
        
        var adj = {};
        for (var k = 0; k < linkObjects.length; k++) {
            var lnk = linkObjects[k];
            var d1 = lnk.getDevice1Name();
            var d2 = lnk.getDevice2Name();
            if (!adj[d1]) adj[d1] = [];
            if (!adj[d2]) adj[d2] = [];
            adj[d1].push({ device: d2, port: lnk.getInterface1Name(), remotePort: lnk.getInterface2Name() });
            adj[d2].push({ device: d1, port: lnk.getInterface2Name(), remotePort: lnk.getInterface1Name() });
        }
        
        if (!adj[sourceName]) return { found: false, error: "Source device not found in topology" };
        if (!adj[destName]) return { found: false, error: "Destination device not found in topology" };
        
        var queue = [[sourceName, [{ device: sourceName, port: null }]]];
        var visited = {};
        visited[sourceName] = true;
        
        while (queue.length > 0) {
            var current = queue.shift();
            var currentDevice = current[0];
            var path = current[1];
            
            if (currentDevice === destName) {
                var formattedPath = [];
                for (var i = 1; i < path.length; i++) {
                    formattedPath.push(path[i].device);
                }
                return { found: true, path: formattedPath, hops: formattedPath.length - 1 };
            }
            
            var neighbors = adj[currentDevice] || [];
            for (var i = 0; i < neighbors.length; i++) {
                if (!visited[neighbors[i].device]) {
                    visited[neighbors[i].device] = true;
                    var newPath = path.slice();
                    newPath.push({ device: neighbors[i].device, port: neighbors[i].port });
                    queue.push([neighbors[i].device, newPath]);
                }
            }
        }
        
        return { found: false, error: "No path found between devices" };
    } catch(e) { return { error: e.toString() }; }
}

getNetworkSegments = function() {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { error: "Device not found: " + deviceName };
        
        var workspace = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
        var linkObjects = workspace.getLinks();
        var usedPorts = {};
        
        for (var k = 0; k < linkObjects.length; k++) {
            var lnk = linkObjects[k];
            if (lnk.getDevice1Name() === deviceName) usedPorts[lnk.getInterface1Name()] = true;
            if (lnk.getDevice2Name() === deviceName) usedPorts[lnk.getInterface2Name()] = true;
        }
        
        var unusedPorts = [];
        var portCount = device.getPortCount();
        
        for (var i = 0; i < portCount; i++) {
            var port = device.getPortAt(i);
            var portName = port.getName();
            var portType = (port.getType && typeof port.getType === "function") ? port.getType() : 0;
            if (!usedPorts[portName] && portType === 1) {
                unusedPorts.push({
                    name: portName,
                    type: portType,
                    up: port.isUp()
                });
            }
        }
        
        return { device: deviceName, unusedPortCount: unusedPorts.length, unusedPorts: unusedPorts };
    } catch(e) { return { error: e.toString() }; }
}

getDeviceByIp = function(ipAddress) {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var pc = d.getPortCount();
            for (var j = 0; j < pc; j++) {
                var p = d.getPortAt(j);
                if (p.getIpAddress() === ipAddress) {
                    return {
                        device: d.getName(),
                        port: p.getName(),
                        model: d.getModel(),
                        type: d.getType()
                    };
                }
            }
        }
        return { error: "No device found with IP: " + ipAddress };
    } catch(e) { return { error: e.toString() }; }
}

getDeviceByMac = function(macAddress) {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        macAddress = macAddress.toUpperCase().replace(/[:-]/g, ":");
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var pc = d.getPortCount();
            for (var j = 0; j < pc; j++) {
                var p = d.getPortAt(j);
                var portMac = p.getMacAddress().toUpperCase().replace(/[:-]/g, ":");
                if (portMac === macAddress) {
                    return {
                        device: d.getName(),
                        port: p.getName(),
                        ip: p.getIpAddress(),
                        model: d.getModel()
                    };
                }
            }
        }
        return { error: "No device found with MAC: " + macAddress };
    } catch(e) { return { error: e.toString() }; }
}

getLayer2Info = function() {
    try {
        var workspace = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
        var linkObjects = workspace.getLinks();
        var deviceCount = ipc.network().getDeviceCount();
        
        var macTable = {};
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var dtype = d.getType();
            if (dtype === 1 || dtype === 16) {
                var portCount = d.getPortCount();
                for (var j = 0; j < portCount; j++) {
                    var p = d.getPortAt(j);
                    var vlan = (p.getVlan && typeof p.getVlan === "function") ? p.getVlan() : 1;
                    var mac = p.getMacAddress();
                    if (mac && mac !== "00:00:00:00:00:00") {
                        if (!macTable[vlan]) macTable[vlan] = [];
                        macTable[vlan].push({
                            mac: mac,
                            device: d.getName(),
                            port: p.getName()
                        });
                    }
                }
            }
        }
        
        return { macTable: macTable };
    } catch(e) { return { error: e.toString() }; }
}

getLayer3Info = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var routes = [];
        var interfaces = [];
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var dtype = d.getType();
            if (dtype === 0 || dtype === 16) {
                var pc = d.getPortCount();
                for (var j = 0; j < pc; j++) {
                    var p = d.getPortAt(j);
                    var ip = p.getIpAddress();
                    if (ip && ip !== "0.0.0.0") {
                        interfaces.push({
                            device: d.getName(),
                            port: p.getName(),
                            ip: ip,
                            subnet: p.getSubnetMask(),
                            up: p.isUp()
                        });
                    }
                }
            }
        }
        
        return { interfaces: interfaces };
    } catch(e) { return { error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// DHCP Management Functions
// ---------------------------------------------------------------------------

createDhcpPool = function(deviceName, poolName, network, subnetMask, defaultRouter, dnsServer) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        
        var commands = [
            "ip dhcp pool " + poolName,
            "network " + network + " " + subnetMask,
            "default-router " + defaultRouter
        ];
        
        if (dnsServer) {
            commands.push("dns-server " + dnsServer);
        }
        
        commands.push("exit");
        commands.push("ip dhcp excluded-address " + network.split(".")[0] + "." + network.split(".")[1] + "." + network.split(".")[2] + ".1");
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, poolName: poolName, network: network };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureDhcpRelay = function(deviceName, interfaceName, dhcpServerIp) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        
        var commands = [
            "interface " + interfaceName,
            "ip helper-address " + dhcpServerIp,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, relayTarget: dhcpServerIp };
    } catch(e) { return { success: false, error: e.toString() }; }
}

excludeDhcpAddresses = function(deviceName, startIp, endIp) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        device.enterCommand("ip dhcp excluded-address " + startIp + " " + endIp, "");
        
        return { success: true, start: startIp, end: endIp };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// Routing Protocol Functions
// ---------------------------------------------------------------------------

configureStaticRoute = function(deviceName, destination, subnetMask, nextHop) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        device.enterCommand("ip route " + destination + " " + subnetMask + " " + nextHop, "");
        
        return { success: true, destination: destination, nextHop: nextHop };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureDefaultRoute = function(deviceName, nextHop) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        device.enterCommand("ip route 0.0.0.0 0.0.0.0 " + nextHop, "");
        
        return { success: true, nextHop: nextHop };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureOspf = function(deviceName, processId, network, wildcardMask, area) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        
        var commands = [
            "router ospf " + processId,
            "network " + network + " " + wildcardMask + " area " + area,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, processId: processId, area: area };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureEigrp = function(deviceName, asNumber, network, wildcardMask) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        
        var commands = [
            "router eigrp " + asNumber,
            "network " + network + " " + wildcardMask,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, asNumber: asNumber };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureRip = function(deviceName, network) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        
        var commands = [
            "router rip",
            "version 2",
            "network " + network,
            "no auto-summary",
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, network: network };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// ACL/Security Functions
// ---------------------------------------------------------------------------

createStandardAcl = function(deviceName, aclNumber, action, sourceNetwork, wildcardMask) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        
        action = action.toLowerCase();
        var aclAction = (action === "permit") ? "permit" : "deny";
        
        device.enterCommand("access-list " + aclNumber + " " + aclAction + " " + sourceNetwork + " " + wildcardMask, "");
        
        return { success: true, aclNumber: aclNumber, action: aclAction, source: sourceNetwork };
    } catch(e) { return { success: false, error: e.toString() }; }
}

createExtendedAcl = function(deviceName, aclNumber, action, protocol, sourceNetwork, destNetwork, eqPort) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        
        action = action.toLowerCase();
        var aclAction = (action === "permit") ? "permit" : "deny";
        
        var cmd = "access-list " + aclNumber + " " + aclAction + " " + protocol + " " + sourceNetwork + " " + destNetwork;
        if (eqPort) {
            cmd += " eq " + eqPort;
        }
        
        device.enterCommand(cmd, "");
        
        return { success: true, aclNumber: aclNumber, action: aclAction, protocol: protocol };
    } catch(e) { return { success: false, error: e.toString() }; }
}

applyAclToInterface = function(deviceName, interfaceName, aclNumber, direction) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        
        direction = direction || "in";
        var commands = [
            "interface " + interfaceName,
            "ip access-group " + aclNumber + " " + direction,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, aclNumber: aclNumber, direction: direction };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// Device Power and Hardware Management
// ---------------------------------------------------------------------------

setDevicePower = function(deviceName, powerState) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        var currentPower = device.getPower();
        
        if (currentPower === powerState) {
            return { success: true, power: powerState, changed: false };
        }
        
        device.setPower(powerState);
        
        var dtype = device.getType();
        if (dtype <= 1 || dtype === 16) {
            device.skipBoot();
        }
        
        return { success: true, power: powerState, changed: true };
    } catch(e) { return { success: false, error: e.toString() }; }
}

getDevicePowerState = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { error: "Device not found: " + deviceName };
        
        return { device: deviceName, power: device.getPower() };
    } catch(e) { return { error: e.toString() }; }
}

resetDevice = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.setPower(false);
        device.setPower(true);
        
        var dtype = device.getType();
        if (dtype <= 1 || dtype === 16) {
            device.skipBoot();
        }
        
        return { success: true, device: deviceName };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// Configuration Management Functions
// ---------------------------------------------------------------------------

saveConfiguration = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        device.enterCommand("write memory", "enable");
        
        return { success: true, device: deviceName };
    } catch(e) { return { success: false, error: e.toString() }; }
}

eraseConfiguration = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        device.enterCommand("write erase", "enable");
        
        return { success: true, device: deviceName };
    } catch(e) { return { success: false, error: e.toString() }; }
}

reloadDevice = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.reload();
        
        return { success: true, device: deviceName };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// NAT Configuration Functions
// ---------------------------------------------------------------------------

configureStaticNat = function(deviceName, insideLocalIp, insideGlobalIp) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        
        var commands = [
            "ip nat inside source static " + insideLocalIp + " " + insideGlobalIp,
            "interface " + getRouterWanInterface(deviceName),
            "ip nat outside",
            "interface " + getRouterLanInterface(deviceName),
            "ip nat inside",
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, insideLocal: insideLocalIp, insideGlobal: insideGlobalIp };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureDynamicNat = function(deviceName, poolName, startIp, endIp, subnetMask, aclNumber) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        
        var commands = [
            "ip nat pool " + poolName + " " + startIp + " " + endIp + " netmask " + subnetMask,
            "access-list " + aclNumber + " permit " + getRouterLanNetwork(deviceName) + " " + getRouterLanWildcard(deviceName),
            "ip nat inside source list " + aclNumber + " pool " + poolName + " overload",
            "interface " + getRouterWanInterface(deviceName),
            "ip nat outside",
            "interface " + getRouterLanInterface(deviceName),
            "ip nat inside",
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, poolName: poolName };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// Batch Operation Helpers
// ---------------------------------------------------------------------------

configureMultipleDevices = function(configs) {
    try {
        var results = [];
        
        for (var i = 0; i < configs.length; i++) {
            var cfg = configs[i];
            var result = { device: cfg.deviceName };
            
            try {
                if (cfg.commands && Array.isArray(cfg.commands)) {
                    var device = ipc.network().getDevice(cfg.deviceName);
                    if (!device) {
                        result.success = false;
                        result.error = "Device not found";
                        results.push(result);
                        continue;
                    }
                    
                    device.skipBoot();
                    
                    for (var j = 0; j < cfg.commands.length; j++) {
                        device.enterCommand(cfg.commands[j], "");
                    }
                    
                    if (cfg.saveConfig) {
                        device.enterCommand("write memory", "enable");
                    }
                    
                    result.success = true;
                } else if (cfg.type === "pc") {
                    configurePcIp(cfg.deviceName, cfg.dhcp, cfg.ip, cfg.subnet, cfg.gateway, cfg.dns);
                    result.success = true;
                }
            } catch(e) {
                result.success = false;
                result.error = e.toString();
            }
            
            results.push(result);
        }
        
        return results;
    } catch(e) { return { error: e.toString() }; }
}

batchAddDevices = function(devices) {
    try {
        var results = [];
        
        for (var i = 0; i < devices.length; i++) {
            var dev = devices[i];
            var result = addDevice(dev.name, dev.model, dev.x || 100, dev.y || 100);
            results.push({ name: dev.name, model: dev.model, success: result });
        }
        
        return results;
    } catch(e) { return { error: e.toString() }; }
}

batchAddLinks = function(links) {
    try {
        var results = [];
        
        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            var result = addLink(link.device1, link.port1, link.device2, link.port2, link.type || "straight");
            results.push({
                from: link.device1 + ":" + link.port1,
                to: link.device2 + ":" + link.port2,
                success: result
            });
        }
        
        return results;
    } catch(e) { return { error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

getRouterWanInterface = function(routerName) {
    var device = ipc.network().getDevice(routerName);
    if (!device) return "GigabitEthernet0/0";
    
    var portCount = device.getPortCount();
    for (var i = 0; i < portCount; i++) {
        var port = device.getPortAt(i);
        var name = port.getName();
        if (name.indexOf("Serial") !== -1) {
            return name;
        }
    }
    return "GigabitEthernet0/0";
}

getRouterLanInterface = function(routerName) {
    var device = ipc.network().getDevice(routerName);
    if (!device) return "GigabitEthernet0/1";
    
    var portCount = device.getPortCount();
    for (var i = 0; i < portCount; i++) {
        var port = device.getPortAt(i);
        var name = port.getName();
        if (name.indexOf("GigabitEthernet0/1") !== -1) {
            return name;
        }
    }
    return "GigabitEthernet0/1";
}

getRouterLanNetwork = function(routerName) {
    var device = ipc.network().getDevice(routerName);
    if (!device) return "192.168.1.0";
    
    var lanIf = getRouterLanInterface(routerName);
    var port = device.getPort(lanIf);
    if (port) {
        var ip = port.getIpAddress();
        var subnet = port.getSubnetMask();
        if (ip && subnet) {
            return calculateNetworkAddress(ip, subnet);
        }
    }
    return "192.168.1.0";
}

getRouterLanWildcard = function(routerName) {
    var device = ipc.network().getDevice(routerName);
    if (!device) return "0.0.0.255";
    
    var lanIf = getRouterLanInterface(routerName);
    var port = device.getPort(lanIf);
    if (port) {
        var subnet = port.getSubnetMask();
        if (subnet) {
            return calculateWildcardMask(subnet);
        }
    }
    return "0.0.0.255";
}

calculateNetworkAddress = function(ip, subnetMask) {
    var ipParts = ip.split(".");
    var subParts = subnetMask.split(".");
    var netParts = [];
    for (var i = 0; i < 4; i++) {
        netParts.push(Math.floor(ipParts[i]) & Math.floor(subParts[i]));
    }
    return netParts.join(".");
}

calculateWildcardMask = function(subnetMask) {
    var subParts = subnetMask.split(".");
    var wildcardParts = [];
    for (var i = 0; i < 4; i++) {
        wildcardParts.push(255 - Math.floor(subParts[i]));
    }
    return wildcardParts.join(".");
}

getInterfaceByIp = function(deviceName, ip) {
    var device = ipc.network().getDevice(deviceName);
    if (!device) return null;
    
    var portCount = device.getPortCount();
    for (var i = 0; i < portCount; i++) {
        var port = device.getPortAt(i);
        if (port.getIpAddress() === ip) {
            return port.getName();
        }
    }
    return null;
}

isPortConfigured = function(deviceName, portName) {
    var device = ipc.network().getDevice(deviceName);
    if (!device) return false;
    
    var port = device.getPort(portName);
    if (!port) return false;
    
    var ip = port.getIpAddress();
    return ip && ip !== "0.0.0.0";
}

validateTopology = function() {
    try {
        var issues = [];
        var warnings = [];
        
        var deviceCount = ipc.network().getDeviceCount();
        if (deviceCount === 0) {
            issues.push("Canvas is empty");
            return { valid: false, issues: issues, warnings: warnings };
        }
        
        var workspace = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
        var linkObjects = workspace.getLinks();
        
        var deviceNames = {};
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var name = d.getName();
            if (deviceNames[name]) {
                issues.push("Duplicate device name: " + name);
            }
            deviceNames[name] = true;
        }
        
        if (linkObjects.length === 0) {
            warnings.push("No links configured - devices are not connected");
        }
        
        for (var k = 0; k < linkObjects.length; k++) {
            var lnk = linkObjects[k];
            var d1 = lnk.getDevice1Name();
            var d2 = lnk.getDevice2Name();
            
            if (!deviceNames[d1]) {
                issues.push("Link references non-existent device: " + d1);
            }
            if (!deviceNames[d2]) {
                issues.push("Link references non-existent device: " + d2);
            }
        }
        
        var ipAddresses = {};
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var pc = d.getPortCount();
            for (var j = 0; j < pc; j++) {
                var p = d.getPortAt(j);
                var ip = p.getIpAddress();
                if (ip && ip !== "0.0.0.0") {
                    if (ipAddresses[ip]) {
                        issues.push("Duplicate IP address: " + ip + " on " + d.getName() + " and " + ipAddresses[ip]);
                    }
                    ipAddresses[ip] = d.getName();
                }
            }
        }
        
        return {
            valid: issues.length === 0,
            issues: issues,
            warnings: warnings,
            deviceCount: deviceCount,
            linkCount: linkObjects.length
        };
    } catch(e) { return { error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// Interface Management Functions
// ---------------------------------------------------------------------------

configureInterfaceIp = function(deviceName, interfaceName, ipAddress, subnetMask, shutdown) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        
        var commands = [
            "interface " + interfaceName,
            "no shutdown"
        ];
        
        if (shutdown) {
            commands[1] = "shutdown";
        }
        
        if (ipAddress && subnetMask) {
            commands.push("ip address " + ipAddress + " " + subnetMask);
        }
        
        commands.push("exit");
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, ip: ipAddress };
    } catch(e) { return { success: false, error: e.toString() }; }
}

shutdownInterface = function(deviceName, interfaceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        device.enterCommand("interface " + interfaceName, "");
        device.enterCommand("shutdown", "");
        device.enterCommand("exit", "");
        
        return { success: true, interface: interfaceName, shutdown: true };
    } catch(e) { return { success: false, error: e.toString() }; }
}

noShutdownInterface = function(deviceName, interfaceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        device.enterCommand("interface " + interfaceName, "");
        device.enterCommand("no shutdown", "");
        device.enterCommand("exit", "");
        
        return { success: true, interface: interfaceName, shutdown: false };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureInterfaceSpeedDuplex = function(deviceName, interfaceName, speed, duplex) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        
        var commands = [
            "interface " + interfaceName,
            "speed " + (speed || "auto"),
            "duplex " + (duplex || "auto"),
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, speed: speed, duplex: duplex };
    } catch(e) { return { success: false, error: e.toString() }; }
}

getInterfaceStatus = function(deviceName, interfaceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { error: "Device not found: " + deviceName };
        
        var port = device.getPort(interfaceName);
        if (!port) return { error: "Interface not found: " + interfaceName };
        
        return {
            device: deviceName,
            interface: interfaceName,
            up: port.isUp(),
            ip: port.getIpAddress(),
            subnet: port.getSubnetMask(),
            mac: port.getMacAddress(),
            vlan: (port.getVlan && typeof port.getVlan === "function") ? port.getVlan() : null,
            speed: (port.getSpeed && typeof port.getSpeed === "function") ? port.getSpeed() : null,
            duplex: (port.getDuplex && typeof port.getDuplex === "function") ? port.getDuplex() : null
        };
    } catch(e) { return { error: e.toString() }; }
}

getAllInterfaceStatus = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { error: "Device not found: " + deviceName };
        
        var interfaces = [];
        var portCount = device.getPortCount();
        
        for (var i = 0; i < portCount; i++) {
            var port = device.getPortAt(i);
            interfaces.push({
                name: port.getName(),
                up: port.isUp(),
                ip: port.getIpAddress(),
                subnet: port.getSubnetMask(),
                mac: port.getMacAddress(),
                vlan: (port.getVlan && typeof port.getVlan === "function") ? port.getVlan() : null,
                speed: (port.getSpeed && typeof port.getSpeed === "function") ? port.getSpeed() : null,
                duplex: (port.getDuplex && typeof port.getDuplex === "function") ? port.getDuplex() : null
            });
        }
        
        return { device: deviceName, interfaces: interfaces };
    } catch(e) { return { error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// Spanning Tree Protocol Functions
// ---------------------------------------------------------------------------

configureSpanningTree = function(switchName, mode) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        
        mode = mode || "pvst";
        device.enterCommand("spanning-tree mode " + mode, "");
        
        return { success: true, mode: mode };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureSpanningTreePortfast = function(switchName, interfaceName) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        
        var commands = [
            "interface " + interfaceName,
            "spanning-tree portfast",
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, portfast: true };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureSpanningTreeBpduguard = function(switchName, interfaceName, enable) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        
        var cmd = enable !== false ? "spanning-tree bpduguard enable" : "spanning-tree bpduguard disable";
        
        var commands = [
            "interface " + interfaceName,
            cmd,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, bpduguard: enable !== false };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureSpanningTreePriority = function(switchName, vlanId, priority) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        
        if (vlanId) {
            device.enterCommand("spanning-tree vlan " + vlanId + " priority " + priority, "");
        } else {
            device.enterCommand("spanning-tree priority " + priority, "");
        }
        
        return { success: true, vlanId: vlanId, priority: priority };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// Port Security Functions
// ---------------------------------------------------------------------------

configurePortSecurity = function(switchName, interfaceName, maxMac, violationAction) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        
        maxMac = maxMac || 1;
        violationAction = violationAction || "restrict";
        
        var commands = [
            "interface " + interfaceName,
            "switchport mode access",
            "switchport port-security",
            "switchport port-security maximum " + maxMac,
            "switchport port-security violation " + violationAction,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, maxMac: maxMac, violation: violationAction };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configurePortSecurityMacAddress = function(switchName, interfaceName, macAddress) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        
        var commands = [
            "interface " + interfaceName,
            "switchport port-security mac-address " + macAddress,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, macAddress: macAddress };
    } catch(e) { return { success: false, error: e.toString() }; }
}

enablePortSecurity = function(switchName, interfaceName) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        
        var commands = [
            "interface " + interfaceName,
            "switchport mode access",
            "switchport port-security",
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, enabled: true };
    } catch(e) { return { success: false, error: e.toString() }; }
}

disablePortSecurity = function(switchName, interfaceName) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        
        var commands = [
            "interface " + interfaceName,
            "no switchport port-security",
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, enabled: false };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// Wireless Configuration Functions
// ---------------------------------------------------------------------------

configureWirelessSSID = function(apName, ssid, security, password) {
    try {
        var device = ipc.network().getDevice(apName);
        if (!device) return { success: false, error: "Access Point not found: " + apName };
        
        device.skipBoot();
        
        security = security || "wpa2";
        
        var commands = [
            "ssid " + ssid,
            "authentication open",
            "encryption " + security + " mode aes"
        ];
        
        if (password) {
            commands.push("authentication key-management wpa");
            commands.push("wpa password " + password);
        }
        
        commands.push("exit");
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, ssid: ssid, security: security };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureWirelessChannel = function(apName, channel, bandwidth) {
    try {
        var device = ipc.network().getDevice(apName);
        if (!device) return { success: false, error: "Access Point not found: " + apName };
        
        device.skipBoot();
        
        channel = channel || "11";
        bandwidth = bandwidth || "20";
        
        device.enterCommand("channel " + channel, "");
        device.enterCommand("channel width " + bandwidth, "");
        
        return { success: true, channel: channel, bandwidth: bandwidth };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureWirelessMode = function(apName, mode) {
    try {
        var device = ipc.network().getDevice(apName);
        if (!device) return { success: false, error: "Access Point not found: " + apName };
        
        device.skipBoot();
        
        mode = mode || "g";
        device.enterCommand("mode " + mode, "");
        
        return { success: true, mode: mode };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// CDP/LLDP Discovery Functions
// ---------------------------------------------------------------------------

enableCdpGlobal = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        device.enterCommand("cdp run", "");
        
        return { success: true, cdpEnabled: true };
    } catch(e) { return { success: false, error: e.toString() }; }
}

disableCdpGlobal = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        device.enterCommand("no cdp run", "");
        
        return { success: true, cdpEnabled: false };
    } catch(e) { return { success: false, error: e.toString() }; }
}

enableCdpInterface = function(deviceName, interfaceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        
        var commands = [
            "interface " + interfaceName,
            "cdp enable",
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, cdpEnabled: true };
    } catch(e) { return { success: false, error: e.toString() }; }
}

enableLldpGlobal = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        device.enterCommand("lldp run", "");
        
        return { success: true, lldpEnabled: true };
    } catch(e) { return { success: false, error: e.toString() }; }
}

enableLldpInterface = function(deviceName, interfaceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        
        var commands = [
            "interface " + interfaceName,
            "lldp transmit",
            "lldp receive",
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, lldpEnabled: true };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// QoS Configuration Functions
// ---------------------------------------------------------------------------

configureMlsQos = function(switchName, enable) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        
        if (enable !== false) {
            device.enterCommand("mls qos", "");
        } else {
            device.enterCommand("no mls qos", "");
        }
        
        return { success: true, mlsQos: enable !== false };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureMlsQosMap = function(switchName, type, value, outputValue) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        
        type = type || "dscp-cos";
        device.enterCommand("mls qos map " + type + " " + value + " " + outputValue, "");
        
        return { success: true, type: type, input: value, output: outputValue };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureInterfaceQos = function(switchName, interfaceName, trust) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        
        trust = trust || "dscp";
        
        var commands = [
            "interface " + interfaceName,
            "mls qos trust " + trust,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, trust: trust };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// Simulation/Test Functions
// ---------------------------------------------------------------------------

ping = function(sourceDevice, destIp, count) {
    count = count || 4;
    try {
        var device = ipc.network().getDevice(sourceDevice);
        if (!device) return { success: false, error: "Device not found: " + sourceDevice };
        
        device.skipBoot();
        
        var cmd = "do ping " + destIp + " repeat " + count;
        device.enterCommand(cmd, "enable");
        
        return { success: true, source: sourceDevice, destination: destIp, count: count, note: "Ping initiated - check simulation mode for results" };
    } catch(e) { return { success: false, error: e.toString() }; }
}

traceroute = function(sourceDevice, destIp) {
    try {
        var device = ipc.network().getDevice(sourceDevice);
        if (!device) return { success: false, error: "Device not found: " + sourceDevice };
        
        device.skipBoot();
        
        var cmd = "do traceroute " + destIp;
        device.enterCommand(cmd, "enable");
        
        return { success: true, source: sourceDevice, destination: destIp, note: "Traceroute initiated - check simulation mode for results" };
    } catch(e) { return { success: false, error: e.toString() }; }
}

testNetworkConnectivity = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var results = [];
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var dInfo = { device: d.getName(), type: d.getType(), reachable: false, neighbors: [] };
            
            var pc = d.getPortCount();
            for (var j = 0; j < pc; j++) {
                var p = d.getPortAt(j);
                if (p.isUp() && p.getIpAddress() && p.getIpAddress() !== "0.0.0.0") {
                    dInfo.reachable = true;
                }
            }
            
            var connections = getConnectedDevices(d.getName());
            if (connections && connections.connections) {
                dInfo.neighborCount = connections.connections.length;
            }
            
            results.push(dInfo);
        }
        
        var reachable = 0;
        for (var i = 0; i < results.length; i++) {
            if (results[i].reachable) reachable++;
        }
        
        return { 
            total: deviceCount, 
            reachable: reachable, 
            devices: results 
        };
    } catch(e) { return { error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// Additional Utility Functions
// ---------------------------------------------------------------------------

getDevicePosition = function(deviceName) {
    try {
        var workspace = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { error: "Device not found: " + deviceName };
        
        return { 
            device: deviceName, 
            name: device.getName(),
            model: device.getModel(),
            type: device.getType()
        };
    } catch(e) { return { error: e.toString() }; }
}

getLinkBetweenDevices = function(device1Name, device2Name) {
    try {
        var workspace = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
        var links = workspace.getLinks();
        
        for (var i = 0; i < links.length; i++) {
            var lnk = links[i];
            var d1 = lnk.getDevice1Name();
            var d2 = lnk.getDevice2Name();
            
            if ((d1 === device1Name && d2 === device2Name) || (d1 === device2Name && d2 === device1Name)) {
                return {
                    device1: d1,
                    port1: lnk.getInterface1Name(),
                    device2: d2,
                    port2: lnk.getInterface2Name(),
                    type: lnk.getLinkType()
                };
            }
        }
        
        return { error: "No link found between " + device1Name + " and " + device2Name };
    } catch(e) { return { error: e.toString() }; }
}

getAllLinksForDevice = function(deviceName) {
    try {
        var workspace = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
        var links = workspace.getLinks();
        var deviceLinks = [];
        
        for (var i = 0; i < links.length; i++) {
            var lnk = links[i];
            if (lnk.getDevice1Name() === deviceName || lnk.getDevice2Name() === deviceName) {
                deviceLinks.push({
                    localDevice: deviceName,
                    localPort: lnk.getDevice1Name() === deviceName ? lnk.getInterface1Name() : lnk.getInterface2Name(),
                    remoteDevice: lnk.getDevice1Name() === deviceName ? lnk.getDevice2Name() : lnk.getDevice1Name(),
                    remotePort: lnk.getDevice1Name() === deviceName ? lnk.getInterface2Name() : lnk.getInterface1Name()
                });
            }
        }
        
        return { device: deviceName, linkCount: deviceLinks.length, links: deviceLinks };
    } catch(e) { return { error: e.toString() }; }
}

getNetworkSummary = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var workspace = ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
        var linkObjects = workspace.getLinks();
        
        var routers = 0, switches = 0, hosts = 0, servers = 0, other = 0;
        var configuredInterfaces = 0;
        var totalPorts = 0;
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var dtype = d.getType();
            
            if (dtype === 0) routers++;
            else if (dtype === 1 || dtype === 16) switches++;
            else if (dtype === 8 || dtype === 17 || dtype === 18) hosts++;
            else if (dtype === 9) servers++;
            else other++;
            
            var pc = d.getPortCount();
            totalPorts += pc;
            
            for (var j = 0; j < pc; j++) {
                var p = d.getPortAt(j);
                var ip = p.getIpAddress();
                if (ip && ip !== "0.0.0.0") {
                    configuredInterfaces++;
                }
            }
        }
        
        return {
            devices: {
                total: deviceCount,
                routers: routers,
                switches: switches,
                hosts: hosts,
                servers: servers,
                other: other
            },
            links: linkObjects.length,
            interfaces: {
                total: totalPorts,
                configured: configuredInterfaces,
                unconfigured: totalPorts - configuredInterfaces
            }
        };
    } catch(e) { return { error: e.toString() }; }
}

saveAllConfigs = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var results = [];
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var dtype = d.getType();
            
            if (dtype === 0 || dtype === 1 || dtype === 16) {
                try {
                    d.skipBoot();
                    d.enterCommand("write memory", "enable");
                    results.push({ device: d.getName(), saved: true });
                } catch(e) {
                    results.push({ device: d.getName(), saved: false, error: e.toString() });
                }
            }
        }
        
        return { count: results.length, results: results };
    } catch(e) { return { error: e.toString() }; }
}

getDevicesByModel = function(model) {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var matches = [];
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            if (d.getModel() === model) {
                matches.push(d.getName());
            }
        }
        
        return { model: model, count: matches.length, devices: matches };
    } catch(e) { return { error: e.toString() }; }
}

getDevicesByType = function(typeName) {
    try {
        var typeNum = deviceTypes[typeName.toLowerCase()];
        if (typeNum === undefined) return { error: "Unknown device type: " + typeName };
        
        var deviceCount = ipc.network().getDeviceCount();
        var matches = [];
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            if (d.getType() === typeNum) {
                matches.push(d.getName());
            }
        }
        
        return { type: typeName, typeId: typeNum, count: matches.length, devices: matches };
    } catch(e) { return { error: e.toString() }; }
}

setDeviceName = function(oldName, newName) {
    try {
        var device = ipc.network().getDevice(oldName);
        if (!device) return { success: false, error: "Device not found: " + oldName };
        
        device.setName(newName);
        
        return { success: true, oldName: oldName, newName: newName };
    } catch(e) { return { success: false, error: e.toString() }; }
}

getSubnetInfo = function(ipAddress, subnetMask) {
    var ipParts = ipAddress.split(".");
    var subParts = subnetMask.split(".");
    
    var network = [];
    var broadcast = [];
    var firstIp = [];
    var lastIp = [];
    
    for (var i = 0; i < 4; i++) {
        var ip = parseInt(ipParts[i], 10);
        var mask = parseInt(subParts[i], 10);
        
        network.push(ip & mask);
        broadcast.push(ip | (~mask & 255));
        firstIp.push((ip & mask) + 1);
        lastIp.push((ip | (~mask & 255)) - 1);
    }
    
    return {
        ip: ipAddress,
        subnet: subnetMask,
        network: network.join("."),
        broadcast: broadcast.join("."),
        firstHost: firstIp.join("."),
        lastHost: lastIp.join("."),
        wildcard: (255 - subParts[0]) + "." + (255 - subParts[1]) + "." + (255 - subParts[2]) + "." + (255 - subParts[3])
    };
}

// ---------------------------------------------------------------------------
// EtherChannel/LACP Functions
// ---------------------------------------------------------------------------

createEtherChannel = function(switchName, portChannelId, mode) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        
        mode = mode || "active";
        device.enterCommand("interface port-channel " + portChannelId, "");
        device.enterCommand("exit", "");
        
        return { success: true, portChannel: portChannelId, mode: mode };
    } catch(e) { return { success: false, error: e.toString() }; }
}

addInterfaceToEtherChannel = function(switchName, interfaceName, portChannelId, mode) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        
        mode = mode || "active";
        
        var commands = [
            "interface " + interfaceName,
            "channel-group " + portChannelId + " mode " + mode,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, portChannel: portChannelId, mode: mode };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureEtherChannelLoadBalance = function(switchName, method) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        
        method = method || "src-mac";
        device.enterCommand("port-channel load-balance " + method, "");
        
        return { success: true, method: method };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// VLAN Trunking Functions
// ---------------------------------------------------------------------------

configureTrunkNativeVlan = function(switchName, interfaceName, nativeVlan) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        nativeVlan = nativeVlan || 1;
        
        var commands = [
            "interface " + interfaceName,
            "switchport mode trunk",
            "switchport trunk native vlan " + nativeVlan,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, nativeVlan: nativeVlan };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureTrunkAllowedVlans = function(switchName, interfaceName, vlans) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        vlans = vlans || "all";
        
        var commands = [
            "interface " + interfaceName,
            "switchport trunk allowed vlan " + vlans,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, allowedVlans: vlans };
    } catch(e) { return { success: false, error: e.toString() }; }
}

removeTrunkAllowedVlan = function(switchName, interfaceName, vlanId) {
    try {
        var device = ipc.network().getDevice(switchName);
        if (!device) return { success: false, error: "Switch not found: " + switchName };
        
        device.skipBoot();
        
        var commands = [
            "interface " + interfaceName,
            "switchport trunk allowed vlan remove " + vlanId,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, interface: interfaceName, removedVlan: vlanId };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// HSRP Functions
// ---------------------------------------------------------------------------

configureHsrp = function(routerName, interfaceName, groupNumber, virtualIp, priority, preempt) {
    try {
        var device = ipc.network().getDevice(routerName);
        if (!device) return { success: false, error: "Router not found: " + routerName };
        
        device.skipBoot();
        
        groupNumber = groupNumber || 1;
        priority = priority || 100;
        preempt = preempt !== false ? "preempt" : "no preempt";
        
        var commands = [
            "interface " + interfaceName,
            "standby " + groupNumber + " ip " + virtualIp,
            "standby " + groupNumber + " priority " + priority,
            "standby " + groupNumber + " " + preempt,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, group: groupNumber, virtualIp: virtualIp, priority: priority };
    } catch(e) { return { success: false, error: e.toString() }; }
}

configureHsrpAuthentication = function(routerName, interfaceName, groupNumber, password) {
    try {
        var device = ipc.network().getDevice(routerName);
        if (!device) return { success: false, error: "Router not found: " + routerName };
        
        device.skipBoot();
        
        groupNumber = groupNumber || 1;
        
        var commands = [
            "interface " + interfaceName,
            "standby " + groupNumber + " authentication text " + password,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, group: groupNumber, authentication: "text" };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// VRRP Functions
// ---------------------------------------------------------------------------

configureVrrp = function(routerName, interfaceName, groupNumber, virtualIp, priority, preempt) {
    try {
        var device = ipc.network().getDevice(routerName);
        if (!device) return { success: false, error: "Router not found: " + routerName };
        
        device.skipBoot();
        
        groupNumber = groupNumber || 1;
        priority = priority || 100;
        preempt = preempt !== false ? "preempt" : "no preempt";
        
        var commands = [
            "interface " + interfaceName,
            "vrrp " + groupNumber + " ip " + virtualIp,
            "vrrp " + groupNumber + " priority " + priority,
            "vrrp " + groupNumber + " " + preempt,
            "exit"
        ];
        
        for (var i = 0; i < commands.length; i++) {
            device.enterCommand(commands[i], "");
        }
        
        return { success: true, group: groupNumber, virtualIp: virtualIp, priority: priority };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// Network Monitoring Functions
// ---------------------------------------------------------------------------

getInterfaceCounters = function(deviceName, interfaceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { error: "Device not found: " + deviceName };
        
        var port = device.getPort(interfaceName);
        if (!port) return { error: "Interface not found: " + interfaceName };
        
        return {
            device: deviceName,
            interface: interfaceName,
            up: port.isUp(),
            ip: port.getIpAddress(),
            mac: port.getMacAddress()
        };
    } catch(e) { return { error: e.toString() }; }
}

getAllInterfaceCounters = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { error: "Device not found: " + deviceName };
        
        var interfaces = [];
        var portCount = device.getPortCount();
        
        for (var i = 0; i < portCount; i++) {
            var port = device.getPortAt(i);
            interfaces.push({
                name: port.getName(),
                up: port.isUp(),
                ip: port.getIpAddress(),
                mac: port.getMacAddress()
            });
        }
        
        return { device: deviceName, interfaces: interfaces };
    } catch(e) { return { error: e.toString() }; }
}

getNetworkStatistics = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var stats = {
            totalDevices: deviceCount,
            totalInterfaces: 0,
            upInterfaces: 0,
            configuredInterfaces: 0,
            switches: 0,
            routers: 0,
            hosts: 0
        };
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var dtype = d.getType();
            
            if (dtype === 0) stats.routers++;
            else if (dtype === 1 || dtype === 16) stats.switches++;
            else if (dtype === 8 || dtype === 17 || dtype === 18) stats.hosts++;
            
            var pc = d.getPortCount();
            stats.totalInterfaces += pc;
            
            for (var j = 0; j < pc; j++) {
                var p = d.getPortAt(j);
                if (p.isUp()) stats.upInterfaces++;
                if (p.getIpAddress() && p.getIpAddress() !== "0.0.0.0") {
                    stats.configuredInterfaces++;
                }
            }
        }
        
        stats.downInterfaces = stats.totalInterfaces - stats.upInterfaces;
        
        return stats;
    } catch(e) { return { error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// Backup/Restore Functions
// ---------------------------------------------------------------------------

exportDeviceConfig = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        device.enterCommand("show running-config", "enable");
        
        return { success: true, device: deviceName, note: "Config displayed - use simulation to capture" };
    } catch(e) { return { success: false, error: e.toString() }; }
}

exportStartupConfig = function(deviceName) {
    try {
        var device = ipc.network().getDevice(deviceName);
        if (!device) return { success: false, error: "Device not found: " + deviceName };
        
        device.skipBoot();
        device.enterCommand("show startup-config", "enable");
        
        return { success: true, device: deviceName, note: "Config displayed - use simulation to capture" };
    } catch(e) { return { success: false, error: e.toString() }; }
}

// ---------------------------------------------------------------------------
// Additional Utility Functions
// ---------------------------------------------------------------------------

getVlanInfo = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var vlans = {};
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var dtype = d.getType();
            
            if (dtype === 1 || dtype === 16) {
                var portCount = d.getPortCount();
                for (var j = 0; j < portCount; j++) {
                    var p = d.getPortAt(j);
                    if (p.getVlan && typeof p.getVlan === "function") {
                        var vlanId = p.getVlan();
                        if (vlanId !== null && vlanId !== undefined) {
                            if (!vlans[vlanId]) {
                                vlans[vlanId] = { switches: [], ports: [] };
                            }
                            if (vlans[vlanId].switches.indexOf(d.getName()) === -1) {
                                vlans[vlanId].switches.push(d.getName());
                            }
                            vlans[vlanId].ports.push({ switch: d.getName(), port: p.getName() });
                        }
                    }
                }
            }
        }
        
        return { vlans: vlans, vlanCount: Object.keys(vlans).length };
    } catch(e) { return { error: e.toString() }; }
}

getAllSwitches = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var switches = [];
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var dtype = d.getType();
            
            if (dtype === 1 || dtype === 16) {
                switches.push({
                    name: d.getName(),
                    model: d.getModel(),
                    type: dtype === 16 ? "multilayerswitch" : "switch",
                    ports: d.getPortCount()
                });
            }
        }
        
        return { count: switches.length, switches: switches };
    } catch(e) { return { error: e.toString() }; }
}

getAllRouters = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var routers = [];
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var dtype = d.getType();
            
            if (dtype === 0) {
                routers.push({
                    name: d.getName(),
                    model: d.getModel(),
                    type: "router",
                    ports: d.getPortCount()
                });
            }
        }
        
        return { count: routers.length, routers: routers };
    } catch(e) { return { error: e.toString() }; }
}

getAllHosts = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var hosts = [];
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var dtype = d.getType();
            
            if (dtype === 8 || dtype === 17 || dtype === 18 || dtype === 19) {
                var ip = "";
                var port = d.getPort("FastEthernet0");
                if (port) ip = port.getIpAddress();
                
                hosts.push({
                    name: d.getName(),
                    model: d.getModel(),
                    type: dtype === 8 ? "pc" : dtype === 17 ? "laptop" : dtype === 18 ? "tabletpc" : "pda",
                    ip: ip
                });
            }
        }
        
        return { count: hosts.length, hosts: hosts };
    } catch(e) { return { error: e.toString() }; }
}

getAllServers = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var servers = [];
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            if (d.getType() === 9) {
                var ip = "";
                var port = d.getPort("FastEthernet0");
                if (port) ip = port.getIpAddress();
                
                servers.push({
                    name: d.getName(),
                    model: d.getModel(),
                    type: "server",
                    ip: ip
                });
            }
        }
        
        return { count: servers.length, servers: servers };
    } catch(e) { return { error: e.toString() }; }
}

findDevicesInSubnet = function(subnetIp, subnetMask) {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var matches = [];
        
        var subnetParts = subnetIp.split(".");
        var maskParts = subnetMask.split(".");
        
        var networkAddr = [];
        for (var i = 0; i < 4; i++) {
            networkAddr.push(parseInt(subnetParts[i], 10) & parseInt(maskParts[i], 10));
        }
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var pc = d.getPortCount();
            
            for (var j = 0; j < pc; j++) {
                var p = d.getPortAt(j);
                var ip = p.getIpAddress();
                var subnet = p.getSubnetMask();
                
                if (ip && ip !== "0.0.0.0" && subnet) {
                    var ipParts = ip.split(".");
                    var subParts = subnet.split(".");
                    
                    var ipNetwork = [];
                    for (var k = 0; k < 4; k++) {
                        ipNetwork.push(parseInt(ipParts[k], 10) & parseInt(subParts[k], 10));
                    }
                    
                    var isMatch = true;
                    for (var k = 0; k < 4; k++) {
                        if (ipNetwork[k] !== networkAddr[k]) {
                            isMatch = false;
                            break;
                        }
                    }
                    
                    if (isMatch) {
                        matches.push({
                            device: d.getName(),
                            port: p.getName(),
                            ip: ip,
                            subnet: subnet
                        });
                    }
                }
            }
        }
        
        return { subnet: subnetIp, mask: subnetMask, count: matches.length, devices: matches };
    } catch(e) { return { error: e.toString() }; }
}

checkDuplicateIps = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var ipMap = {};
        var duplicates = [];
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var pc = d.getPortCount();
            
            for (var j = 0; j < pc; j++) {
                var p = d.getPortAt(j);
                var ip = p.getIpAddress();
                
                if (ip && ip !== "0.0.0.0") {
                    if (ipMap[ip]) {
                        duplicates.push({
                            ip: ip,
                            device1: ipMap[ip],
                            device2: d.getName()
                        });
                    } else {
                        ipMap[ip] = d.getName();
                    }
                }
            }
        }
        
        return { hasDuplicates: duplicates.length > 0, count: duplicates.length, duplicates: duplicates };
    } catch(e) { return { error: e.toString() }; }
}

getUnconfiguredDevices = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var unconfigured = [];
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var hasIp = false;
            
            var pc = d.getPortCount();
            for (var j = 0; j < pc; j++) {
                var p = d.getPortAt(j);
                var ip = p.getIpAddress();
                if (ip && ip !== "0.0.0.0") {
                    hasIp = true;
                    break;
                }
            }
            
            if (!hasIp) {
                unconfigured.push({
                    name: d.getName(),
                    model: d.getModel(),
                    type: d.getType()
                });
            }
        }
        
        return { count: unconfigured.length, devices: unconfigured };
    } catch(e) { return { error: e.toString() }; }
}

findDevicesWithoutGateway = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var withoutGateway = [];
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var dtype = d.getType();
            
            if (dtype === 8 || dtype === 9 || dtype === 17) {
                var hasGateway = false;
                
                var port = d.getPort("FastEthernet0");
                if (port) {
                    var gateway = port.getDefaultGateway && port.getDefaultGateway();
                    if (gateway && gateway !== "0.0.0.0") {
                        hasGateway = true;
                    }
                }
                
                if (!hasGateway) {
                    withoutGateway.push({
                        name: d.getName(),
                        model: d.getModel()
                    });
                }
            }
        }
        
        return { count: withoutGateway.length, devices: withoutGateway };
    } catch(e) { return { error: e.toString() }; }
}

getDevicesWithDhcp = function() {
    try {
        var deviceCount = ipc.network().getDeviceCount();
        var dhcpDevices = [];
        
        for (var i = 0; i < deviceCount; i++) {
            var d = ipc.network().getDeviceAt(i);
            var dtype = d.getType();
            
            if (dtype === 8 || dtype === 17 || dtype === 9) {
                if (d.getDhcpFlag && d.getDhcpFlag()) {
                    dhcpDevices.push({
                        name: d.getName(),
                        model: d.getModel(),
                        type: dtype === 8 ? "pc" : dtype === 17 ? "laptop" : "server"
                    });
                }
            }
        }
        
        return { count: dhcpDevices.length, devices: dhcpDevices };
    } catch(e) { return { error: e.toString() }; }
}

compareSubnets = function(ip1, mask1, ip2, mask2) {
    var parts1 = ip1.split(".");
    var parts2 = ip2.split(".");
    var maskParts1 = mask1.split(".");
    var maskParts2 = mask2.split(".");
    
    var network1 = [], network2 = [];
    for (var i = 0; i < 4; i++) {
        network1.push(parseInt(parts1[i], 10) & parseInt(maskParts1[i], 10));
        network2.push(parseInt(parts2[i], 10) & parseInt(maskParts2[i], 10));
    }
    
    var sameNetwork = true;
    for (var i = 0; i < 4; i++) {
        if (network1[i] !== network2[i]) {
            sameNetwork = false;
            break;
        }
    }
    
    var cidr1 = 0, cidr2 = 0;
    for (var i = 0; i < 4; i++) {
        var octet = parseInt(maskParts1[i], 10);
        while (octet > 0) {
            cidr1 += octet & 1;
            octet >>= 1;
        }
    }
    for (var i = 0; i < 4; i++) {
        var octet = parseInt(maskParts2[i], 10);
        while (octet > 0) {
            cidr2 += octet & 1;
            octet >>= 1;
        }
    }
    
    return {
        ip1: ip1,
        ip2: ip2,
        mask1: mask1,
        mask2: mask2,
        cidr1: cidr1,
        cidr2: cidr2,
        sameNetwork: sameNetwork
    };
}

isIpInSubnet = function(ip, subnetIp, subnetMask) {
    var ipParts = ip.split(".");
    var subnetParts = subnetIp.split(".");
    var maskParts = subnetMask.split(".");
    
    var ipNetwork = [];
    var subnetNetwork = [];
    
    for (var i = 0; i < 4; i++) {
        ipNetwork.push(parseInt(ipParts[i], 10) & parseInt(maskParts[i], 10));
        subnetNetwork.push(parseInt(subnetParts[i], 10) & parseInt(maskParts[i], 10));
    }
    
    for (var i = 0; i < 4; i++) {
        if (ipNetwork[i] !== subnetNetwork[i]) {
            return false;
        }
    }
    
    return true;
}

cidrToSubnet = function(cidr) {
    var mask = [];
    for (var i = 0; i < 4; i++) {
        var bits = cidr > 8 ? 8 : cidr;
        mask.push(256 - Math.pow(2, 8 - bits));
        cidr -= bits;
        if (cidr < 0) cidr = 0;
    }
    return mask.join(".");
}

subnetToCidr = function(subnetMask) {
    var parts = subnetMask.split(".");
    var cidr = 0;
    for (var i = 0; i < 4; i++) {
        var octet = parseInt(parts[i], 10);
        while (octet > 0) {
            cidr += octet & 1;
            octet >>= 1;
        }
    }
    return cidr;
}

calculateUsableHosts = function(subnetMask) {
    var cidr = subnetToCidr(subnetMask);
    if (cidr >= 31) return 0;
    return Math.pow(2, 32 - cidr) - 2;
}

getNextAvailableIp = function(subnetIp, subnetMask) {
    var parts = subnetIp.split(".");
    var maskParts = subnetMask.split(".");
    
    var network = [];
    for (var i = 0; i < 4; i++) {
        network.push(parseInt(parts[i], 10) & parseInt(maskParts[i], 10));
    }
    
    var deviceCount = ipc.network().getDeviceCount();
    var usedIps = {};
    
    for (var i = 0; i < deviceCount; i++) {
        var d = ipc.network().getDeviceAt(i);
        var pc = d.getPortCount();
        
        for (var j = 0; j < pc; j++) {
            var p = d.getPortAt(j);
            var ip = p.getIpAddress();
            if (ip && ip !== "0.0.0.0") {
                usedIps[ip] = true;
            }
        }
    }
    
    var broadcast = [];
    for (var i = 0; i < 4; i++) {
        broadcast.push((network[i] | (255 - parseInt(maskParts[i], 10))));
    }
    
    for (var ip = network[3] + 1; ip < broadcast[3]; ip++) {
        var testIp = network[0] + "." + network[1] + "." + network[2] + "." + ip;
        if (!usedIps[testIp]) {
            return testIp;
        }
    }
    
    return null;
}