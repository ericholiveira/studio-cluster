var logging = require('./logging');
var localServices = require('./localServices');
var remoteServices = require('./remoteServices');
var constants = require('./constants');
var util = require('./util');
var uuid = require('node-uuid');

var SYNC_SERVICE_MESSAGE = constants.SYNC_SERVICE_MESSAGE;
var START_SERVICE_MESSAGE = constants.START_SERVICE_MESSAGE;
var STOP_SERVICE_MESSAGE = constants.STOP_SERVICE_MESSAGE;
var DISCOVER_SERVICES_MESSAGE = constants.DISCOVER_SERVICES_MESSAGE;



function removeServices(url, port, id) {
    'use strict';

    var filterByUrlAndPort = function(info){
        return info.url !== url || info.port !== port || info.id !== id;
    };

    Object.keys(remoteServices).forEach(function(k){
        remoteServices[k] = remoteServices[k].filter(filterByUrlAndPort);
    });

    serviceRegistry[getServiceRegistryKey(url, port, id)] = null;
}

/**
 * A hash table of known service endpoints.
 *
 * @type {object}
 */
var serviceRegistry = {};
var startedPlugin = false;

/**
 * Generate a unique key for the service registry
 *
 * @param {string} address - Remote service IP address
 * @param {number} port - Remote service port
 * @param {string} id - Remote publisher ID
 *
 * @returns {string}
 */
function getServiceRegistryKey(address, port, id) {
    'use strict';

    return address + ':' + port + '#' + id;
}

var clusterPlugin = function(configuration){
    if(startedPlugin){
        return function noop(){};//Just make sure you dont run this plugin twice
    }else{
        startedPlugin = true;
        return function(serviceListener,Studio){
            var prioritizeLocal,rpcPort,syncInterval,instanceId = uuid.v4();
            configuration = configuration || {};
            rpcPort = configuration.rpcPort || 10120;
            syncInterval = (+configuration.syncInterval >0)? +configuration.syncInterval : 30*60*1000;
            prioritizeLocal = configuration.prioritizeLocal !== false;
            var publisherStartPromise = configuration.publisher || clusterPlugin.publisher.broadcast(rpcPort);
            var transport = configuration.transport || clusterPlugin.transport.primus(rpcPort);

            // NOTE: To maintain compatibility with the previous implementation, prioritizeLocal will send 100% of the
            // traffic to the local service be default.
            var balance = configuration.balance || clusterPlugin.balance.random({ percentLocal: prioritizeLocal ? 100 : -1});

            publisherStartPromise = publisherStartPromise(instanceId, Studio);
            transport = transport(instanceId, Studio);
            balance = balance(transport, Studio);

            publisherStartPromise.then(function(publisher){
                publisher.send(DISCOVER_SERVICES_MESSAGE);

                publisher.on(START_SERVICE_MESSAGE, addServiceToRegistry);
                publisher.on(STOP_SERVICE_MESSAGE, removeServiceFromRegistry);
                publisher.on(DISCOVER_SERVICES_MESSAGE, replyToDiscoveryRequest);
                publisher.on(SYNC_SERVICE_MESSAGE, updateServiceRegistry);

                function addServiceToRegistry(msg) {
                    var key;

                    if (!(msg.id instanceof Array)) {
                        msg.id = [msg.id];
                    }

                    msg.id.forEach(function (_id) {
                        logging.instance.log('Registering remote service ' + _id);
                        remoteServices[_id] = remoteServices[_id] || [];

                        remoteServices[_id] = remoteServices[_id].filter(function (info) {
                            return info.url !== msg.address || info.port !== msg.port || info.id !== msg._publisherId;
                        });

                        remoteServices[_id].push({url: msg.address, port: msg.port, id: msg._publisherId});
                    });

                    key = getServiceRegistryKey(msg.address, msg.port, msg._publisherId);

                    serviceRegistry[key] = serviceRegistry[key] || [];
                    serviceRegistry[key] = msg.id.concat(serviceRegistry[key]);
                    serviceRegistry[key] = util.uniq(serviceRegistry[key]);
                }

                function removeServiceFromRegistry(msg) {
                    var key;
                    
                    if (!(msg.id instanceof Array)) {
                        msg.id = [msg.id];
                    }
                    logging.instance.log('Removing remote service ' + msg.id);
                    key = getServiceRegistryKey(msg.url, msg.port, msg._publisherId);

                    msg.id.forEach(function (_id) {
                        remoteServices[_id] = remoteServices[_id] || [];

                        remoteServices[_id] = remoteServices[_id].filter(function (info) {
                            return info.url !== msg.address || info.port !== msg.port || info.id !== msg._publisherId;
                        });

                        serviceRegistry[key] = (serviceRegistry[key] || []).filter(function (v) {
                            return v !== _id;
                        });
                    });
                }

                function replyToDiscoveryRequest() {
                    var ids = Object.keys(localServices).filter(function (id) {return localServices[id];});
                    logging.instance.log('Sending discovery reply with: \n\t* '+ids.join('\n\t* '));
                    publisherStartPromise.then(function () {
                        publisher.send(START_SERVICE_MESSAGE, ids);
                    });
                }

                function updateServiceRegistry(msg) {
                    logging.instance.log('Updating service registry: '+msg.id);
                    serviceRegistry[getServiceRegistryKey(msg.address, msg.port, msg._publisherId)] = msg.id;
                    
                    Object.keys(remoteServices).forEach(function (_id) {
                        remoteServices[_id] = remoteServices[_id].filter(function (info) {
                            return info.url !== msg.address || info.port !== msg.port || info.id !== msg._publisherId;
                        });
                    });

                    msg.id.forEach(function (_id) {
                        logging.instance.log('Updating remote service information: '+_id);
                        remoteServices[_id].push({url: msg.address, port: msg.port, id: msg._publisherId});
                    });
                }
            });
            
            if(syncInterval){
                publisherStartPromise.then(function(publisher){
                    setInterval(function(){
                        var ids = Object.keys(localServices).filter(function(id) { return localServices[id]; });

                        logging.instance.log('Sending sync message');
                        publisher.send(SYNC_SERVICE_MESSAGE, ids);
                    }, syncInterval);
                });    
            }
            
            serviceListener.onStart(function(serv){
                logging.instance.log('Starting service listener');
                localServices[serv.id] = true;

                publisherStartPromise.then(function(publisher){
                    publisher.send(START_SERVICE_MESSAGE,serv.id);
                });
            });

            serviceListener.onStop(function(serv){
                logging.instance.log('Stopping service listener');
                localServices[serv.id] = false;
                
                publisherStartPromise.then(function(publisher){
                    publisher.send(STOP_SERVICE_MESSAGE,serv.id);
                });
            });

            transport.on('end',function(obj){
                logging.instance.log('Destroying message transport');
                removeServices(obj.url, obj.port, obj.id);
            });

            transport.on('close',function(obj){
                logging.instance.log('Closing message transport');
                var key = getServiceRegistryKey(obj.url, obj.port, obj.id);
                var tmp = serviceRegistry[key];
                removeServices(obj.url, obj.port, obj.id);
                serviceRegistry[key] = tmp;
            });

            transport.on('reconnected',function(obj){
                logging.instance.log('Reconnecting message transport');
                (serviceRegistry[getServiceRegistryKey(obj.url, obj.port, obj.id)] || []).forEach(function(_id){
                    remoteServices[_id] = remoteServices[_id] || [];

                    remoteServices[_id] = remoteServices[_id].filter(function(info){
                        return info.url !== obj.url || info.port !== obj.port || info.id !== obj.id;
                    });

                    remoteServices[_id].push({url:obj.url, port:obj.port, id: obj.id});
                });
            });

            serviceListener.interceptSend(function(send, rec){
                logging.instance.log('Intercepting message: ' + rec);
                return function() {
                    return balance.send(send, rec, localServices, remoteServices, Array.prototype.slice.call(arguments));
                };
            });
        };
    }
};

clusterPlugin.publisher={
    broadcast : require('./publisher/broadcast'),
    redis : require('./publisher/redis'),
    localhost : require('./publisher/localhost')
};

clusterPlugin.transport={
    primus : require('./transport/primus'),
    localhost : require('./transport/localhost')
};

clusterPlugin.balance={
    random : require('./balance/random'),
    multiplex : require('./balance/multiplex'),
    roundRobin: require('./balance/round-robin')
};
module.exports = clusterPlugin;