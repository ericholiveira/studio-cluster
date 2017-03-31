var logging = require('./../../logging');

/**
 * Distribute traffic sequentially between all services answering to the same route.
 *
 * @param {Object} configuration - Configuration object
 * @param {Array.<string>} [configuration.alwaysLocal] - Add routes to this array that should never go out of process.
 *     (Default: [])
 * @param {number} [configuration.percentLocal] - Specify the percent of traffic that should stay local.
 *     (Default: -1 which means no special favoring, 0 means no local traffic)
 * @param {Object} configuration.transport - Transport for sending payloads remotely
 * @param {Object} Studio - Studio instance
 * @constructor
 */
function RoundRobin(configuration, Studio) {
    'use strict';

    this.alwaysLocal = configuration.alwaysLocal || [];
    this.percentLocal = configuration.percentLocal >= -1 && configuration.percentLocal <= 100 ? configuration.percentLocal : -1;
    this.transport = configuration.transport;

    this.nextNode = {};
}

/**
 * Send payload to the next node in a sequence.
 *
 * If percentLocal is specified the traffic is sent locally first to a certain percent, then sequentially among remote
 * services.  If percentLocal is set to -1, the local service will be the first node in the round robin sequence.  If
 * percentLocal is 0, all traffic will be sent to remote hosts.
 *
 * @param {function} send - Local send function
 * @param {string} rec - Receiver route
 * @param {object} localServices - In-process services
 * @param {object} remoteServices - Remote and Out of Process services
 * @param {Array.<*>} payload - Arguments to send to the service
 */
RoundRobin.prototype.send = function(send, rec, localServices, remoteServices, payload) {
    'use strict';

    var idx = this.nextNode[rec] || ((localServices[rec] && this.percentLocal === -1) ? 0 : 1);

    this.nextNode[rec] = idx + 1;

    if (!remoteServices[rec] || remoteServices[rec].length === 0) {
        this.nextNode[rec] = 0;
    } else if (idx >= remoteServices[rec].length) {
        // This is the end of the round-robin sequence, the next request
        // should start at the beginning of the sequence again
        this.nextNode[rec] = (localServices[rec] && this.percentLocal === -1) ? 0 : 1;
    }

    if ((!remoteServices[rec] || remoteServices[rec].length === 0) ||
        (localServices[rec] &&
        (this.alwaysLocal.indexOf(rec) > -1 ||
        (this.percentLocal > 0 && Math.floor(Math.random() * 100) <= this.percentLocal) ||
        (this.percentLocal === -1 && idx === 0)))) {
        return send.apply(this, payload);
    } else {
        // NOTE: Since idx 0 is reserved for local, we need idx - 1 to index the array here
        if (idx === 0) { idx += 1; }

        return this.transport.send(
            remoteServices[rec][idx - 1].url,
            remoteServices[rec][idx - 1].port,
            remoteServices[rec][idx - 1].id,
            payload,
            rec
        );
    }
};

module.exports = function(options) {
    'use strict';
	logging.instance.log('Balancer: round robin');

    return function(transport, Studio) {
        options.transport = transport;

        return new RoundRobin(options, Studio);
    };
};
