var EventEmitter = require("events").EventEmitter;
var publicIp = require('public-ip');
var Redis = require('ioredis');
var util = require('util');
var uuid = require('node-uuid');
var logging = require('./../../logging');


var redisSender,redisSubscriber,started = null;
var myIp = null;
var CHANNEL_NAME = '__studio_service_discovery';

var redisEmitter = new EventEmitter();

function StudioRedisEmitter(instanceId, opt){
    'use strict';

    this.id = instanceId;
    this.sender = opt.sender;
    this.rpcPort = opt.rpcPort;
    this.subscriber = opt.subscriber;
}
util.inherits(StudioRedisEmitter,EventEmitter);

StudioRedisEmitter.prototype.send = function(action,info){
    'use strict';

    var message = JSON.stringify({
        _publisherId: this.id,
        address : myIp,
        port : this.rpcPort,
        id : info,
        action : action
    });

    redisSender.publish(CHANNEL_NAME,message);
};


module.exports = function (rpcPort, opt, pluginOpt) {
    'use strict';
	logging.instance.log('Publisher method: redis');

    return function(instanceId, Studio){
        var getIp;

        opt = opt || {};
        pluginOpt = pluginOpt || {};
        getIp = pluginOpt.getIp ? Studio.promise.method(pluginOpt.getIp): Studio.promise.promisify(publicIp.v4);
        redisSubscriber = new Redis(opt);
        redisSender = new Redis(opt);

        var instance = new StudioRedisEmitter(instanceId, {
            sender:redisSender,
            subscriber:redisSubscriber,
            rpcPort:rpcPort
        });

        return new Studio.promise(function (resolve, reject) {
            instance.subscriber.subscribe(CHANNEL_NAME,function(err){
                if(err){
                    return reject(err);
                }
                getIp().then(function(ip){
                    myIp = ip;
                    resolve(instance);
                }).catch(reject);
            });

            redisSubscriber.on('error',reject);
            redisSubscriber.on('message',function(channel,msg){
                try{
                    msg = JSON.parse(msg);

                    if(msg._publisherId !== instance.id){ //localhost
                        instance.emit(msg.action,msg);
                    }
                }catch(err){
                    // nothing to do... ignore message
                }
            });
        });
    };
};
