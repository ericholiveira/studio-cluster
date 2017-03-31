var Random = require('./../random');
var logging = require('./../../logging');

/**
 * For any route in the `routes` array, send the same payload to all services. For all other routes,
 * send payload to the balance module specified in the `passThrough` property.
 *
 * @param {Object} configuration - Configuration object
 * @param {Array.<string>} [configuration.routes] - Add routes to this array that should be multiplexed.
 *     (Default: [])
 * @param {Object} [configuration.passThrough] - Specify the balance module to use on all other routes.
 *     (Default: Random)
 * @param {Object} configuration.transport - Transport for sending payloads remotely
 * @param {Object} Studio - Studio instance
 * @constructor
 */
function Multiplex(configuration, Studio) {
    'use strict';

    this.routes = configuration.routes || [];
    this.transport = configuration.transport;
    this.passThrough = configuration.passThrough || new Random({ prioritizeLocal: 100 })(this.transport, Studio);
    this._studio = Studio;

    if (typeof this.passThrough === 'function') {
        this.passThrough = this.passThrough(this.transport, Studio);
    }
}

/**
 * Send payload to the specified services.
 *
 * @param {function} send - Local send function
 * @param {string} rec - Receiver route
 * @param {object} localServices - In-process services
 * @param {object} remoteServices - Remote and Out of Process services
 * @param {Array.<*>} payload - Arguments to send to the service
 */
Multiplex.prototype.send = function(send, rec, localServices, remoteServices, payload) {
    'use strict';

    var responses = [];

    if (this.routes.indexOf(rec) > -1) {
        // Handle the case of no matching route
        if (!localServices[rec] && (!remoteServices[rec] || remoteServices[rec].length === 0)) { return send.apply(this, payload); }

        if (localServices[rec]) { responses.push(send.apply(this, payload)); }

        if (remoteServices[rec]) {
            for (var i = 0; i < remoteServices[rec].length; i++) {
               responses.push(this.transport.send(
                   remoteServices[rec][i].url,
                   remoteServices[rec][i].port,
                   remoteServices[rec][i].id,
                   payload,
                   rec
               ));
            }
        }

        return this._studio.promise.all(responses);
    } else {
        return this.passThrough.send(send, rec, localServices, remoteServices, payload);
    }
};

module.exports = function(options) {
    'use strict';
	logging.instance.log('Balancer: multiplex');

    return function(transport, Studio) {
        options.transport = transport;

        return new Multiplex(options, Studio);
    };
};
