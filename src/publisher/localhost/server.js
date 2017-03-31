var ipc = require('multicast-ipc');
var util = require('util');
var EventEmitter = require("events").EventEmitter;
var logging = require('./../../logging');

/**
 * This publisher uses multicast to discover services running on the local network.  In most situations, this is limited
 * to your local machine.  However, with properly configured networks this publisher can be used to connect services
 * across multiple machines.
 *
 * To isolate clusters make sure they use a unique combination of multicastAddress and port.  To unite services on the
 * network into a single multicast cluster, give them the same combination of multicastAddress and port.
 *
 * @param {string} instanceId - ID of this publisher (all services in this process will share the ID)
 * @param {object} opt - Options
 * @param {Function} Studio
 * @returns {Promise}
 *
 * @fulfil {MulticastEmitter} The multicast socket is bound and ready to listen
 * @reject {Error} There is an error binding to the proper socket
 *
 * @constructor
 */
function MulticastEmitter(instanceId, opt, Studio) {
    'use strict';

    var self = this;

    self.id = instanceId;
    self.multicastPort = opt.multicastPort;
    self.multicastAddress = opt.multicastAddress;
    self.rpcPort = opt.rpcPort;

    var _reject, _resolve;

    var startupPromise = new Studio.promise(function (resolve, reject) {
        _reject = reject;
        _resolve = resolve;
    });

    ipc.withSocket(self.multicastPort, self.multicastAddress, function (api) {
        self.api = api;

        _resolve(self);

        return api.repeatWhile(shouldContinueListening, listenLoop, true);

        function listenLoop() {
            return api.waitForMessage()
                      .then(function (req) {
                          var msg;

                          try{
                              msg = JSON.parse(req.message.toString());

                              if (msg._publisherId !== self.id) {
                                  // This makes the localhost transport and localhost publisher work together
                                  // Unfortunately, it means that you cannot use them with other publishers and
                                  // transports (no mixing and matching).
                                  msg.address = self.multicastAddress;

                                  self.emit(msg.action, msg);
                              }
                          } catch(err){
                              // nothing to do... ignore message
                          }

                          return true;
                      });
        }

        function shouldContinueListening(lastValue) {
            return lastValue;
        }
    }).catch(function (err) {
        self.emit('error', err);

        _reject(err);
    });

    return startupPromise;
}

util.inherits(MulticastEmitter, EventEmitter);

MulticastEmitter.prototype.send = function(action, info) {
    'use strict';
    var self = this;
    var message = JSON.stringify({
        _publisherId: this.id,
        port : this.rpcPort,
        id : info,
        action : action
    });
    setTimeout(function(){
      self.api.broadcast(message);
    },Math.floor(Math.random()*500));
};

module.exports = function (rpcPort, opt) {
    'use strict';
	logging.instance.log('Publisher method: IPC');

    return function (instanceId, Studio){
        var multicastPort = opt && opt.multicastPort || 10121;
        var multicastAddress = opt && opt.multicastAddress || '224.0.2.1';

        var instance = new MulticastEmitter(instanceId, {
            rpcPort : rpcPort,
            multicastPort: multicastPort,
            multicastAddress: multicastAddress
        }, Studio);

        return new Studio.promise.resolve(instance);
    };
};
