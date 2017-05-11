var Primus = require('primus');
var serializeError = require('serialize-error');
var util = require('util');
var EventEmitter = require("events").EventEmitter;
var uuid = require('node-uuid');
var logging = require('./../../logging');

var generateId = function(){
    'use strict';
    return uuid.v4();
};

function PrimusTransport(instanceId,port,serverOpt,clientOpt,Studio){
    'use strict';
	logging.instance.log('Transport method: Primus');
	var refs = {};
	serverOpt = serverOpt || {};
	serverOpt.port = port;
	serverOpt.instanceId = instanceId;
	serverOpt.https = function () { this.isSecure = true; };
	serverOpt.http = function () { this.isSecure = false; };
	this._Studio = Studio;
	this._clientOpt = clientOpt || {};
	this._connections = {};
	this._server = Primus.createServer(function connection(spark) {
		spark.on('data', function(message) {
			if(message && message.r){
				refs[message.r] = refs[message.r] || Studio(message.r);
				refs[message.r].apply(null,message.p).then(function(res){
					spark.write({i:message.i, m:res,s:1});
				}).catch(function(err) {
					err = serializeError(err);
					spark.write({i: message.i, m: err, s: 0});
				});
			}
		});
	}, serverOpt);
}
util.inherits(PrimusTransport,EventEmitter);

PrimusTransport.prototype._connect = function(url,port,id){
	var _self = this;
	var address = url+':'+port+'#'+id;
	if(!this._connections[address]){
		this._connections[address] = new this._Studio.promise(function(resolve,reject){
			var scheme = _self._clientOpt.isSecure ? 'wss://' : 'ws://';
			var client = new _self._server.Socket(scheme+url+":"+port+"/?svc="+encodeURIComponent(id),_self._clientOpt);
			client.on('open', function(){resolve(client);});
			client.on('timeout',reject);
			client.on('end',function(){_self.emit('end',{url:url,port:port,id:id});});
			client.on('close',function(){_self.emit('close',{url:url,port:port,id:id});});
			client.on('destroy',function(){_self.emit('end',{url:url,port:port,id:id});});
			client.on('disconnect',function(){_self.emit('end',{url:url,port:port,id:id});});
			client.on('reconnected',function(){_self.emit('reconnected',{url:url,port:port,id:id});});
			client.on('close',function(){
				// Reject all current promises, at this point we dont know if its going to be finished
				Object.keys(client._promises).forEach(function(k){
						client._promises[k].reject(new Error('CLOSED'));
				});
			});
			client.on('end',function(){
				// We decided to stop trying to reconnect, free variable so we can connect again if it restarrt
				_self._connections[address] = null;
			});
			client.on('data',function(msg){
				var funk;
				if(msg && msg.i && client._promises[msg.i]){
							funk = msg.s ? client._promises[msg.i].resolve : client._promises[msg.i].reject;
							delete client._promises[msg.i];
							funk(msg.m);
					}
			});
			client._promises={};
		});
	}
};
PrimusTransport.prototype.send = function(url,port,id,params,receiver){
    'use strict';

	var address = url+':'+port+'#'+id;
	var _self = this;
	this._connect(url,port,id);

    return this._connections[address].then(function(client){
	    var id = generateId();
	    var _resolve , _reject;
	    var promise = new _self._Studio.promise(function(resolve,reject) {
	        _resolve = resolve;
	        _reject = reject;
	    });
	    client._promises[id] = {
	        resolve: _resolve,
	        reject:_reject
	    };
	    client.write({i:id,p:params,r:receiver});
	    return promise;
	});
};
module.exports = function(rpcPort, options){
	'use strict';

	return function(instanceId, Studio){
		var server = options && options.server;
		var client = options && options.client;

		return new PrimusTransport(instanceId, rpcPort, server, client, Studio);
	};
};

