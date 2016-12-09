#!/bin/env node
//  virtual network tabletop application
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var mongojs = require('mongojs');
var crypto = require('crypto');
var parseDataUri = require('parse-data-uri');
var package = require('./package.json');

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
        self.dburl     = process.env.OPENSHIFT_MONGODB_DB_URL || "localhost/tabletop";

        if (typeof self.ipaddress === "undefined") {
            //  Log errors on OpenShift but continue w/ 127.0.0.1 - this
            //  allows us to run/test the app locally.
            console.warn('No OPENSHIFT_NODEJS_IP var, using 127.0.0.1');
            //self.ipaddress = "127.0.0.1";
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
            
      gstate = {
        marker_counter: 0,
        markers: {},
        background: {},
        layers: {'default': {paths:[], visible: true} },
        notepad: ""
      };
      
      io.on('connection', function (socket) {
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
        
        //transform data uri to stored image
        function uploadimage(data, callback){
          if(!data)
            return false;
          var datauri = data;
          if(data.substr(0,4) == "url(")
            datauri = data.substring(5,data.length-2);
          if(datauri.substr(0,5) == "data:"){
            var parsedURI = parseDataUri(datauri);
            var md5sum = crypto.createHash('md5');
            md5sum.update(parsedURI.data);
            parsedURI.hash = md5sum.digest('base64');
            self.images.update({hash:parsedURI.hash},parsedURI,{upsert:true,multi:false},
              function(err,doc){
                if(err)
                  socket.emit('message',"Error uploading image: "+err);
                else{
                  self.images.findOne({hash:parsedURI.hash},{_id:1},function(err,doc){
                    callback("/images/"+doc._id);
                  });
                }
              }
            );
            return true;
          }
          //this is not a data uri
          return false;
        }
        
        //handle markers
        
        function addmarker(data){
          var newmarker = data;
          newmarker.id = self.getId(gstate.marker_counter++);
          //test to see if it's a data uri
          if(!uploadimage(newmarker.bg,function(newurl){
            newmarker.bg = "url('"+newurl+"')";
            gstate.markers[newmarker.id] = newmarker;
            io.sockets.emit('add marker',newmarker);
          }) ){
            gstate.markers[newmarker.id] = newmarker;
            io.sockets.emit('add marker',newmarker);
          }
          return newmarker;
        }
        
        socket.on('add marker',function(data){
          addmarker(data);
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
        
        //handle dice rolling
        socket.on('roll dice',function(data){
          var diesize=35; //px
          if(!data.parent){
            //count total number of dice to be rolled
            var total = data.dice.reduce(function(tot,curr){ return tot + curr[1]; },0);
            //first add a container
            var cwidth = total*(diesize+5) + 5;
            if(cwidth<340) cwidth = 340;
            var cheight = diesize + 120;
            var container = addmarker({ width:cwidth, height:cheight, label:data.label, diceholder:true /*,bg:"#fcfcfc"*/});
            data.parent = container.id;
          }
          //now add dice to the container
          var offset = 5;
          data.dice.sort(function(a,b){ return a[0]-b[0]; });
          data.dice.forEach(function(d){
              for(var i=0; i<d[1]; ++i){
                var rank = d[0];
                var roll = data.blank ? null : Math.ceil(Math.random()*rank);
                var label = "d"+rank+(roll ? ":"+roll : "");
                addmarker({dierank:rank, dieroll: roll,label:label,
                            width:diesize, height:diesize, parent: data.parent, 
                            position:data.position ? data.position : {top:85, left:offset}});
                offset += diesize+5;
                
              }
          });              
        });
        
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
        
        socket.on('pan layer',function(data){
          var layer = gstate.layers[data.layer];
          if(layer){
            layer.paths.forEach(function(path){
              path.points.forEach(function(pt){
                pt[0] += data.offset[0];
                pt[1] += data.offset[1];
              });
            });
            socket.broadcast.emit('pan layer',data);
          }
        });
        
        socket.on('zoom layer',function(data){
          var layer = gstate.layers[data.layer];
          if(layer){
            layer.paths.forEach(function(path){
              path.points.forEach(function(pt){
                var shifted = [pt[0]-data.center[0],pt[1]-data.center[1]];
                pt[0] = data.center[0] + shifted[0]*data.factor;
                pt[1] = data.center[1] + shifted[1]*data.factor;
              });
            });
            io.sockets.emit('zoom layer',data);
          }
        });
        
        //handle background
        socket.on('set grid',function(data){
          gstate.grid = data;
          socket.broadcast.emit('set grid',data);
        });
        
        socket.on('set background',function(data){
          if(!uploadimage(data.background,function(newurl){
            data.background = "url('"+newurl+"')";
            gstate.background = data;
            io.sockets.emit('set background', data);
          })){
            gstate.background = data;
            io.sockets.emit('set background',data);
          }
        });
        socket.on('clearmaskzone',function(data){
          if(!gstate.background['_clearmaskzones'])
            gstate.background['_clearmaskzones'] = [];
          gstate.background['_clearmaskzones'].push(data);
          io.sockets.emit('clearmaskzone',data);
        });
        
        //handle save,load games
        socket.on('save game',function(data){
          if(data.overwrite){
            self.savegames.remove({'name':data.name})
          }
          self.savegames.insert({'name':data.name, ttversion: package.version, 'gamestate':gstate},
            function(err,doc){
              if(err)
                socket.emit('message',"An error occurred during savegame: "+err);
              else
                socket.emit('message',"Game "+data.name+" successfully saved.");
            });
        });
        
        socket.on('load game',function(data){
          var id = mongojs.ObjectId(data._id);
          self.savegames.findOne({_id:id},function(err,doc){
            if(err)
              console.log('database error loading savegame',err);
            else{
              gstate = doc.gamestate;
              io.sockets.emit('sync state',gstate);
            }
          });
        });
        
        socket.on('list saves',function(data,callback){
          self.savegames.find({},{_id:1,name:1}).sort({_id:-1,name:1},function(err,docs){
            if(!err){
              docs.forEach(function(doc){
                doc.time = doc._id.getTimestamp();
              });
            }
            callback(err,docs); 
          });
        });
        
        //handle notepad sync
        socket.on('update notepad', function(data){ 
          gstate.notepad = data;
          socket.broadcast.emit('update notepad',data);
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
        app.get('/images/:_id',function(req,res){
          //find the image in the database
          self.images.findOne({_id:mongojs.ObjectId(req.params._id)},function(err,doc){
            if(err)
              res.status(404).send("Can't find image width id "+_id);
            else{
              res.set('Content-Type',doc.mimeType)
              res.send(doc.data.buffer);
            }
          });
        });
        // Connect to the database
        self.db = mongojs(self.dburl,['savegames','images']);
        self.db.on('error',function(err){ console.log('database error',err); });
        self.savegames = self.db.collection('savegames');
        self.savegames.ensureIndex({'name':1});
        self.images = self.db.collection('images');
        self.images.ensureIndex({'hash':1},{unique:true});
    };


    /**
     *  Start the server (starts up the sample application).
     */
    self.start = function() {
        //  Start the app on the specific interface (and port).
        server.listen(self.port, self.ipaddress, function() {
            console.log('%s: %s v%s server started on %s:%d ...',
                        Date(Date.now() ), package.name, package.version, self.ipaddress, self.port);
        });
    };

};   /*  Sample Application.  */



/**
 *  main():  Main code.
 */
var zapp = new tabletop_server();
zapp.initialize();
zapp.start();

