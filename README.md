Zero configuration cluster module for studio.

Studio-cluster
=========

A plugin for [Studio](https://github.com/ericholiveira/studio) which makes insanely easy to clusterize your services.
If you're running on a local network it enable clusterization WITH ZERO CONFIGURATION

Studio cluster is built around two pillars:

1 - Service discovery
2 - Remote procedure call (RPC)

[Studio](https://github.com/ericholiveira/studio) is a framework to easily create distributable applications by default.
When creating your services with Studio, it creates the guarantees needed to make your services distributable, Studio-cluster goes one step further
and handle the communication for this services

I would love to receive feedback.Let me know if you've used it. What worked and what is wrong. Contribute and spread the word.

Table of contents
========

- [Install](#install)
- [Intro](#intro)
- [Getting Started](#getting-started)
- [Examples](#examples)
- [Logging](#logging)
- [Dependencies](#dependencies)
- [Build](#build)
- [Test](#test)
- [License](#license)

Install
========

To install execute:

    npm install studio-cluster --save

It depends on Studio, so if you dont have it installed, install it:

	npm install studio --save

Intro
========

[Studio](https://github.com/ericholiveira/studio) is built around message-passing, immutability, async and also have a powerful, yet simple to use plugin system
for this reasons it is the perfect candidate for creating distributed services. You dont need this plugin to distribute your services on Studio, you can manually
implement the communication, but this plugin makes it INSANELY easy. It features a service discovery (which we call publisher), and a rpc feature (which we call
transport)

With this plugin you can distribute several services on different process in the same machine, in several machines in the same local network, in several machines
available in the internet or anything in between. It just works. It handles the failures in communication, timeouts, and reconnects.



Currently under development and tests.

Dont use this project in production yet, this is inteded to serve as a experiment for the implementation.

The goal is to enable remote procedure call and service discovery for Studio services, with absolutely no configuration.

To do this all services needs to be running in the same network. They all communicate through a broadcast port (default to 10121). And they also need a port 
to direct communication (default do 10120). If you want to test the process automatic communication on the same machine all you need to do is to choose a different port for one of the process.


Getting Started
========

The first important thing is to understand how [Studio](https://github.com/ericholiveira/studio) works, so if you're new and just looking for the magical code
take a look in Studio's documentation and try it a litte bit before come back here.

If you already know how Studio works, then you can start to play with Studio-cluster. The code above shows how to implement two process communicating in 
two different machines in the same network.

Process 1:

```js
var Studio = require('studio');
var studioCluster = require('studio-cluster');
Studio.use(studioCluster());

Studio(function test1(){
    return 'test';
});

```

Process 2:

```js
var Studio = require('studio');

var studioCluster = require('studio-cluster');
Studio.use(studioCluster());
//uncomment the line above if you dont have two machines to test, and just want to see two process in the same machine communicating
//Studio.use(studioCluster({rpcPort:10199}));

var test1 = Studio('test1');
Studio(function test2(){
    //call remote service
    return test1().then(function(message){
        console.log(message);
    }).catch(function(err){
        console.error(err);
    });
});

var _test2 =  Studio('test2');

setInterval(_test2,1500);
```

This is it... no boilerplate required we just added the line to require the plugin and one line to make Studio use it... is that simple,
take a look at the [helloworld example](https://github.com/ericholiveira/studio-cluster/tree/master/examples/helloworld) for more instructions, and 
check the other more complex examples available, but always keep in mind that it really doesnt matter what you plan to do, studio-cluster
is service communication with no boilerplate

Logging
=======

Logs can be enabled via environment variable:

```bash
DEBUG="Studio-Cluster" node my-studio-app.js
```
or
```bash
export DEBUG="Studio-Cluster"
node my-studio-app.js
```


Examples
========

The easiest way to run the examples is cloning this repo, executing npm install in the root folder and then exploring [examples](https://github.com/ericholiveira/studio-cluster/tree/master/examples/) folder to see and understand the basic examples

Dependencies
========
Studio-cluster depends on:
- [Studio](https://github.com/ericholiveira/studio)
- [primus](https://github.com/primus/primus) default transport for rpc
- [ws](https://github.com/websockets/ws) websocket implementation for rpc
- [node-uuid](https://github.com/broofa/node-uuid) to create an id for the messages it uses internally
- [serialize-error](https://github.com/sindresorhus/serialize-error) to serialize the errors to send over the wire
- [public-ip](https://github.com/sindresorhus/public-ip) to discover the public ip when communicating outside of local network (redis transport)
- [ioredis](https://github.com/luin/ioredis) when running multiple servers on multiple networks, you will need redis for service discovery this 
plugin is used to communicate with redis
- [multicast-ipc](https://github.com/avishnyak/multicast-ipc) used to communicate on the locahost for service discovery and rpc

Build
========

To build the project you have to run:

    npm install
    npm test

This is going to install dependencies, lint and test the code

Test
========

Run test with:

    npm test

License
========

The MIT License (MIT)

Copyright (c) 2016 Erich Oliveira [ericholiveira.com](http://ericholiveira.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
