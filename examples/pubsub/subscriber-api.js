var Studio = require('studio');

var studioCluster = require('../../src'); // require('studio-cluster'); on your projects

// When using the localhost transport and publisher, all services can be on the same port
// If you switch the transport and publisher, make sure to change each service to a unique port
var rpcPort = 8100;

// you only need to choose a rpcPort if your process are running in the same machine, then you need a port to each process as in:
var clusterConfig = {
    // Use the localhost transport to connect to services using IPC on the local machine.
    // To use the default Web Socket-based transport, comment out the following config line.
    transport: studioCluster.transport.localhost(rpcPort),

    // Use the localhost publisher to for service discovery on the local machine only.
    // To use the default local network (broadcast-based) service discovery, comment out the following config.
    publisher: studioCluster.publisher.localhost(rpcPort),

    rpcPort: rpcPort
};

Studio.use(studioCluster(clusterConfig));

Studio(function billedApi(name) {
    'use strict';

    console.log('Accessing number of shares for ' + name + ': 0');

    // Erlich always has 0 shares.
    return {
        shares: 0
    };
});
