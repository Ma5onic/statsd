var dgram  = require('dgram')
  , sys    = require('sys')
  , net    = require('net')
  , lines  = require('lines')
  , config = require('./config')

var counters = {};
var tcpcount = 0;
var timers = {};
var debugInt, flushInt, server, tcpserver;

config.configFile(process.argv[2], function (config, oldConfig) {
  if (! config.debug && debugInt) {
    clearInterval(debugInt); 
    debugInt = false;
  }

  if (config.debug) {
    if (debugInt !== undefined) { clearInterval(debugInt); }
    debugInt = setInterval(function () { 
      sys.log("Counters:\n" + sys.inspect(counters) + "\nTimers:\n" + sys.inspect(timers));
    }, config.debugInterval || 20000);
  }

  var responder;
  if (config.master) {
    responder = masterListener; 
    var flushInterval = Number(config.flushInterval || 20000);

    flushInt = setInterval(function () {
      var statString = '';
      var ts = Math.round(new Date().getTime() / 1000);
      var numStats = 0;
      var key;

      for (key in counters) {
        var value = counters[key] / (flushInterval / 1000);
        var message = 'stats.' + key + ' ' + value + ' ' + ts + "\n";
        statString += message;
        counters[key] = 0;

        numStats += 1;
      }

      for (key in timers) {

        if (timers[key].length > 0) {
          var pctThreshold = config.percentThreshold || 95;
          var values = timers[key].sort(function (a,b) { return a-b; });
          var count = values.length;
          var min = values[0];
          var max = values[count - 1];

          var mean = min;
          var maxAtThreshold = max;

          if (count > 1) {
            var thresholdIndex = Math.round(((100 - pctThreshold) / 100) * count);
            var numInThreshold = count - thresholdIndex;
            values = values.slice(0, numInThreshold);
            maxAtThreshold = values[numInThreshold - 1];

            // average the remaining timings
            var sum = 0;
            for (var i = 0; i < numInThreshold; i++) {
              sum += values[i];
            }

            mean = sum / numInThreshold;
          }

          timers[key] = [];

          var message = "";
          message += 'stats.' + key + '.mean ' + mean + ' ' + ts + "\n";
          message += 'stats.' + key + '.upper ' + max + ' ' + ts + "\n";
          message += 'stats.' + key + '.upper_' + pctThreshold + ' ' + maxAtThreshold + ' ' + ts + "\n";
          message += 'stats.' + key + '.lower ' + min + ' ' + ts + "\n";
          message += 'stats.' + key + '.rps ' + count/(flushInterval / 1000) + ' ' + ts + "\n";
          statString += message;

          numStats += 1;
        }

      }

      timers = {};
//console.log(tcpcount + " messages last interval");
tcpcount = 0;
      counters = {};

      statString += 'statsd.numStats ' + numStats + ' ' + ts + "\n";
      
      try {
        var graphite = net.createConnection(config.graphitePort, config.graphiteHost);
        graphite.addListener('error', function(connectionException){
          if (config.debug) {
            sys.log(connectionException);
          }
        });
        graphite.on('connect', function() {
          this.write(statString);
          this.end();
        });
      } catch(e){
        if (config.debug) {
          sys.log(e);
        }
      }

    }, flushInterval);
    // slave based work
       if (config.slaves) {
          config.slaves.forEach(function(item) {
             connectToSlave(item, config);
          });
       }
    } else {
      var socket = undefined;
      var listener = net.createServer(function(incoming) {
         console.log("Connected to master");
         socket = incoming;
         socket.on('close', function() {
           console.log("Lost connection to master, awaiting reconnection...");
           socket = undefined;
         });
      });
      console.log("Awaiting connection from master on port " + (config.slavePort || 8127));
      listener.listen(config.slavePort || 8127);
      responder = function(msg, rinfo) {
        console.log(msg.toString());
        if (socket != undefined) {
          socket.write(msg.toString());
        }
      };
    }
    
    server = dgram.createSocket('udp4', responder);
    server.bind(config.port || 8125);

    if(config.master) {
      tcpserver = net.createServer(function(socket) {

        lines(socket);
    socket.setEncoding('ascii');
        socket.on('line', function(line) {
            tcpcount += 1;
//console.log("Message: |" + line.trim() + "|");
            masterListener(line.trim(), null);
        })
      })

    tcpserver.listen(8125);
    }

});

function connectToSlave(address, config) {
    var parts = address.split(":");
    console.log("Connecting to " + parts[0] + ":" + parts[1]);
    var stream = net.createConnection(parts[1], parts[0]);
    stream.on('connect', function() {
        console.log("connected to " + parts[0] + ":" + parts[1]);
    });
    stream.on('data', function(data) {
        if (config.dumpMessages) {
            console.log("Recieved from slave: " + data.toString());
        }
        masterListener(data, null);
    });
    stream.on('error', function() {
        // ignore this - the close event will be raised anyway but
        // if we don't have this event node will die
    });
    stream.on('close', function() {
        console.log("Connection to " + address + " lost, retrying in 1 second");
        stream.destroy();
        setTimeout(function() { connectToSlave(address); console.log(address) }, 1000);
    });
    console.log("finished" + address);
}

function masterListener(msg, rifno) {
      if (config.dumpMessages) { sys.log(msg.toString()); }
      var bits = msg.toString().replace(/\\n/g,'').split(':');
      var key = bits.shift()
                    .replace(/\s+/g, '_')
                    .replace(/\//g, '-')
                    .replace(/[^a-zA-Z_\-0-9\.]/g, '');

      if (bits.length == 0) {
        bits.push("1");
      }

      for (var i = 0; i < bits.length; i++) {
        var sampleRate = 1;
        var fields = bits[i].split("|");
        if (fields[1] === undefined) {
            sys.log('Bad line: ' + fields);
            continue;
        }
        if (fields[1].trim() == "ms") {
          if (! timers[key]) {
            timers[key] = [];
          }
          timers[key].push(Number(fields[0] || 0));
        } else if (fields[1].trim() == "hs") {
            var val = parseInt(fields[0]);
            var lowerbound = parseInt(val/10)*10; 
            key = key+"."+lowerbound+"-"+(lowerbound+9);
            if (!counters[key]) {
                counters[key] = 0;
            }
            counters[key] += 1;
        } else {
          if (fields[2] && fields[2].match(/^@([\d\.]+)/)) {
            sampleRate = Number(fields[2].match(/^@([\d\.]+)/)[1]);
          }
          if (! counters[key]) {
            counters[key] = 0;
          }
          counters[key] += Number(fields[0] || 1) * (1 / sampleRate);
        }
      }
}
