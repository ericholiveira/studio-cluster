var ipc = require('multicast-ipc');
var serializeError = require('serialize-error');
var util = require('util');
var EventEmitter = require("events").EventEmitter;
var uuid = require('node-uuid');
var logging = require('./../../logging');

function LocalhostTransport(port, serverOpt, clientOpt, Studio) {
    'use strict';
	logging.instance.log('Transport method: IPC');

    var refs = {};

    serverOpt = serverOpt || {};
    serverOpt.port = port || 61088;
    serverOpt.multicastAddress = serverOpt.multicastAddress || '224.0.2.1';

    var self = this;
    
    this._Studio = Studio;
    this._clientOpt = clientOpt;
    this._serverOpt = serverOpt;
    this._promises = {};

    this._server = ipc.withSocket(serverOpt.port, serverOpt.multicastAddress, function (api) {
        self.api = api;
        
        return api.repeatWhile(function () { return true; }, function () {
            return api.waitForMessage()
                .then(function (msg) {
                    var payload, func;

                    try {
                        payload = JSON.parse(msg.message.toString());
                    } catch (e) {
                        // Drop this message
                    }

                    // Request from remote service
                    if (payload && payload.r && payload.to && payload.to === serverOpt.id) {
                        refs[payload.r] = refs[payload.r] || Studio(payload.r);

                        refs[payload.r].apply(null, payload.p)
                            .then(function (res) {
                                api.send(JSON.stringify({i: payload.i, m: res, s: 1, to: payload.from, from: serverOpt.id}), payload.q, serverOpt.multicastAddress);
                            })
                            .catch(function (err) {
                                err = serializeError(err);

                                api.send(JSON.stringify({i: payload.i, m: err, s: 0, to: payload.from, from: serverOpt.id}), payload.q, serverOpt.multicastAddress);
                            });
                    } else if (payload && payload.i && self._promises[payload.i] && payload.to === serverOpt.id) {
                        func = payload.s ? self._promises[payload.i].resolve : self._promises[payload.i].reject;
                        delete self._promises[payload.i];
                        func(payload.m);
                    }
                    
                    return true;
                });
        });
    });
}

util.inherits(LocalhostTransport, EventEmitter);

LocalhostTransport.prototype.send = function (url, port, id, params, receiver) {
    'use strict';

    var self = this;
    var _id = uuid.v4();
    var _resolve, _reject;

    var promise = new self._Studio.promise(function (resolve, reject) {
        _resolve = resolve;
        _reject = reject;
    });

    self._promises[_id] = {
        resolve: _resolve,
        reject: _reject
    };
    setTimeout(function(){
        self.api.send(JSON.stringify({i: _id, p: params, r: receiver, q: self._serverOpt.port, to: id, from: self._serverOpt.id}), port, url);
    },Math.floor(Math.random()*500));

    return promise.timeout(self._clientOpt.timeout || 5000).catch(self._Studio.promise.TimeoutError, function () {
        // In case of timeout, we assume the service is unreachable
        self.emit('end', { url: url, port: port, id: id});
    });
};

module.exports = function (rpcPort, options) {
    'use strict';

    return function (instanceId, Studio) {
        var server = options && options.server || {};
        var client = options && options.client || {};

        server.id = instanceId;

        return new LocalhostTransport(rpcPort, server, client, Studio);
    };
};
