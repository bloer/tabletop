#!/bin/env node
//  virtual network tabletop application
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);

/**
 *  Define the sample application.
 */
var tabletop_server = function() {

    //  Scope.
    var self = this;


    /*  ================================================================  */
    /*  Helper functions.                                                 */
    /*  ================================================================  */

    /**
     *  Set up server IP address and port # using env variables/defaults.
     */
    self.setupVariables = function() {
        //  Set the environment variables we need.
        self.ipaddress = process.env.OPENSHIFT_NODEJS_IP;
        self.port      = process.env.OPENSHIFT_NODEJS_PORT || 8080;

        if (typeof self.ipaddress === "undefined") {
            //  Log errors on OpenShift but continue w/ 127.0.0.1 - this
            //  allows us to run/test the app locally.
            console.warn('No OPENSHIFT_NODEJS_IP var, using 127.0.0.1');
            self.ipaddress = "127.0.0.1";
        };
    };


    
    /**
     *  terminator === the termination handler
     *  Terminate server on receipt of the specified signal.
     *  @param {string} sig  Signal to terminate on.
     */
    self.terminator = function(sig){
        if (typeof sig === "string") {
           console.log('%s: Received %s - terminating sample app ...',
                       Date(Date.now()), sig);
           process.exit(1);
        }
        console.log('%s: Node server stopped.', Date(Date.now()) );
    };


    /**
     *  Setup termination handlers (for exit and a list of signals).
     */
    self.setupTerminationHandlers = function(){
        //  Process on exit and signals.
        process.on('exit', function() { self.terminator(); });

        // Removed 'SIGPIPE' from the list - bugz 852598.
        ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
         'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
        ].forEach(function(element, index, array) {
            process.on(element, function() { self.terminator(element); });
        });
    };

    self.setupEventHandlers = function(){
      self.prefix = "_TT";
      self.markerprefix = self.prefix+"_MARKER";
      self.getIndex = function(id){ return id.substr(self.markerprefix.length); }
      self.getId = function(index){ return self.markerprefix+index; }
            
      self.gamestate = {
        marker_counter: 0,
        markers: {},
        background: {},
        layers: {'default': {paths:[], visible: true} }
      };
      
      io.on('connection', function (socket) {
        var gstate = self.gamestate;
        io.sockets.emit('message',"New connection opened from "+socket.conn.remoteAddress);
        socket.emit('sync state',gstate);
        
        socket.on('disconnect',function(){
          io.sockets.emit('message',"User at "+socket.conn.remoteAddress+" disconnected");
        });
        //resynchronize completely
        socket.on('sync state',function(data){
          if(data){
            gstate = data;
            io.sockets.emit('sync state',gstate);
          }
          else
            socket.emit('sync state',gstate);
        });
        //handle markers
        socket.on('add marker',function(data){
          var newmarker = data;
          newmarker.id = self.getId(gstate.marker_counter++);
          gstate.markers[newmarker.id] = newmarker;
          io.sockets.emit('add marker',newmarker);
        });
        socket.on('update marker',function(data){
          //get the index from the id
          var old = gstate.markers[data.id];
          if(!old){
            console.log("Received update request for missing marker!");
            return;
          }
          //don't replace, just merge
          for(var attrname in data){old[attrname] = data[attrname];}
          socket.broadcast.emit('update marker',data);
        });
        socket.on('remove marker',function(data){
          delete gstate.markers[data.id];
          socket.broadcast.emit('remove marker',data);
        });
        
        function addlayer(data){
          var layername = data.layer;
          if(!gstate.layers[layername]){
            gstate.layers[layername] = {visible: true, paths:[]};
            socket.broadcast.emit('add layer',{layer:layername, visible: true});
          }
          return gstate.layers[layername]
        }
        
        //handle layer addition and removal
        socket.on('add layer',addlayer);
        
        socket.on('show layer',function(data){
          layer = gstate.layers[data.layer];
          if(layer){
            layer.visible = data.visible;
            socket.broadcast.emit('show layer',data);
          }
        });
        
        socket.on('clear layer',function(data){
          layer = gstate.layers[data.layer];
          if(layer){
            layer.paths = [];
            socket.broadcast.emit('clear layer',data);
          }
        });
        
        socket.on('delete layer',function(data){
          delete gstate.layers[data.layer];
          socket.broadcast.emit('delete layer',data);
        });
        
        //handle canvas draw events
        socket.on('add path',function(data){
          var layer = gstate.layers[data.layer];
          if(!layer){
            //this shouldn't really happen, but...
            layer = addlayer({layer:data.layer})
          }
          layer.paths.push(data.path);
          socket.broadcast.emit('add path',data);
        });
        
        
        //handle background
        socket.on('set background',function(data){
          gstate.background = data;
          socket.broadcast.emit('set background',data);
        });
        socket.on('clearmaskzone',function(data){
          if(!gstate.background['_clearmaskzones'])
            gstate.background['_clearmaskzones'] = [];
          gstate.background['_clearmaskzones'].push(data);
          io.sockets.emit('clearmaskzone',data);
        });
      });
    };

    /*  ================================================================  */
    /*  App server functions (main app logic here).                       */
    /*  ================================================================  */
    
    /**
     *  Initializes the sample application.
     */
    self.initialize = function() {
        self.setupVariables();
        self.setupTerminationHandlers();
        self.setupEventHandlers();
        // Create the express server and routes.
        app.use(express.static(__dirname + '/static'));
    };


    /**
     *  Start the server (starts up the sample application).
     */
    self.start = function() {
        //  Start the app on the specific interface (and port).
        server.listen(self.port, self.ipaddress, function() {
            console.log('%s: Node server started on %s:%d ...',
                        Date(Date.now() ), self.ipaddress, self.port);
        });
    };

};   /*  Sample Application.  */



/**
 *  main():  Main code.
 */
var zapp = new tabletop_server();
zapp.initialize();
zapp.start();

