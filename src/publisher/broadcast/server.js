var logging = require('../../logging.js');
var dgram = require('dgram');
var util = require('util');
var EventEmitter = require("events").EventEmitter;
var logging = require('./../../logging');

var BROADCAST_IP = "255.255.255.255";

function BroadcastEmitter(instanceId, opt){
    'use strict';
    
    this.id = instanceId;
    this.client = opt.client;
    this.rpcPort = opt.rpcPort;
    this.broadcastPort = opt.broadcastPort;
}

util.inherits(BroadcastEmitter,EventEmitter);

BroadcastEmitter.prototype.send = function(action,info){
    'use strict';

    var message = JSON.stringify({
        _publisherId:this.id,
        port : this.rpcPort,
        id : info,
        action : action
    });

    this.client.send(message,0,message.length, this.broadcastPort, BROADCAST_IP);
};

module.exports = function (rpcPort, opt) {
	logging.instance.log('Publisher method: RPC');
    return function(instanceId, Studio){
        var client = dgram.createSocket({type:'udp4',reuseAddr:true});
        var broadcastPort = opt && opt.broadcastPort || 10121;
        var instance = new BroadcastEmitter(instanceId, {
            rpcPort: rpcPort,
            client: client,
            broadcastPort: broadcastPort
        });

        return new Studio.promise(function (resolve, reject) {
            client.bind({port: broadcastPort, exclusive: false}, function () {
                client.setBroadcast(true);
                resolve(instance);
            });
            client.on('error', function (error) {
                instance.emit("error",error);
                client.close();
                reject(error);
            });
            client.on("message",function(msg,rinfo){
                try{
                    msg = JSON.parse(msg);
                    if(msg._publisherId !== instance.id){ //localhost
                        msg.address = rinfo.address;
                        instance.emit(msg.action,msg);
                    }
                }catch(err){
                    // nothing to do... ignore message
                }
            });
        });
    };
};
