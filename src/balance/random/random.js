var logging = require('./../../logging');

/**
 * Distribute traffic randomly between all services answering to the same route.
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
function Random(configuration, Studio) {
    'use strict';

    this.alwaysLocal = configuration.alwaysLocal || [];
    this.percentLocal = configuration.percentLocal || -1;
    this.transport = configuration.transport;
}

/**
 * Send payload to a random endpoint.
 *
 * If percentLocal is specified the traffic is sent locally first to a certain percent, then randomly among remote
 * services.  If percentLocal is set to -1, the local service will receive a proportional amount of traffic.  If
 * percentLocal is 0, all traffic will be sent to remote hosts.
 *
 * @param {function} send - Local send function
 * @param {string} rec - Receiver route
 * @param {object} localServices - In-process services
 * @param {object} remoteServices - Remote and Out of Process services
 * @param {Array.<*>} payload - Arguments to send to the service
 */
Random.prototype.send = function(send, rec, localServices, remoteServices, payload) {
    'use strict';

    var idx;

    if ((!remoteServices[rec] || remoteServices[rec].length === 0) ||
        (localServices[rec] &&
        (this.alwaysLocal.indexOf(rec) > -1 ||
        (this.percentLocal > 0 && Math.floor(Math.random() * 100) <= this.percentLocal) ||
        (this.percentLocal === -1 && Math.floor(Math.random() * remoteServices[rec].length + 1) === 0)))) {
        return send.apply(this, payload);
    } else {
        idx = Math.floor(Math.random() * remoteServices[rec].length);

        return this.transport.send(
            remoteServices[rec][idx].url,
            remoteServices[rec][idx].port,
            remoteServices[rec][idx].id,
            payload,
            rec
        );
    }
};

module.exports = function(options) {
    'use strict';
	logging.instance.log('Balancer: random');
    
    return function(transport, Studio) {
        options.transport = transport;

        return new Random(options, Studio);
    };
};
