'use strict';

var Mue       = require('../index').Mue
  , through   = require('through2')
  , duplexify = require('duplexify')
  ;

// We're going to write the first component, which is going to be a logger
// each component is a stream that receives messages and decides whether to act on it

function LoggerService() {
  return through.obj(function (msg, enc, cb) {
    // If the service can't handle this message, we'll ignore.
    if (msg.type !== 'LOG') return cb();

    console.log("LOGGING >>", msg.log);
    cb();
  })
}

// Let's create the "I need" pattern described by Fred George.
// We'll create a simple message exchange where the consumer will send a message the states "I_NEED_VEGGIES".
// Once the producers would receive that message, each producer will send a message with it's owned veggie.
// The consumer will act on those veggies once it receives them.

// Let's start with the Producers

function CucumberProducer() {
  return through.obj(function (msg, enc, cb) {
    // Again, let's make sure that the msg is for us.
    if (msg.type !== "I_NEED_VEGGIES") return cb();
    this.push({type: "VEGGIE", veggie: "Cucumber"})
    cb();
  })
}

// Let's create another producer. Let's make this producer Async. It will respond to the message with a random delay.

function TomatoProducer() {
  return through.obj(function (msg, enc, cb) {
    if (msg.type !== "I_NEED_VEGGIES") return cb();
    setTimeout(function () {
      this.push({type: "VEGGIE", veggie: "Tomato"})
      cb();
    }.bind(this), Math.round(200 * Math.random()));
  })
}

// Now let's create the consumer. The consumer will request for veggies on the next tick. Also, it would have a timeout
// and will respond accordingly if a message came in delay. Each message that is being received would be logged.

function VeggieConsumer() {
  // So far we're been using Through/transform streams. The stream receives a message and transforms it to another
  // another message or disposes it.
  // In that use case, we'll need to use a different kind of stream. We'll need to use a duplex stream. Because,
  // the first message that is being initiated by the consumer, is a new message in the chain. So it shouldn't be
  // transformed. It should be sent directly to the readable side of the duplex.

  // We can handle Microservice state here. Let's use `isOnTime` to mark whether the msg is on time.
  var isOnTime  = true
    , outgoing  = through.obj()
    , incoming  = through.obj(function (msg, enc, cb) {
        // This is a regular Through stream like we used to do
        if (msg.type === 'VEGGIE' && isOnTime)
          this.push({type:"LOG", log: "I got a " + msg.veggie});
        else if (msg.type === 'VEGGIE')
          this.push({type:"LOG", log: "Too bad I won't eat " + msg.veggie + " today."});

        cb();
      })
    ;

  // Let's request the veggies and handle the time out. It's always best to start things going on the
  // next tick
  process.nextTick(function () {
    // We'll request it to the outgoing stream
    outgoing.write({type: "I_NEED_VEGGIES"})

    // As for the timeout
    setTimeout(function () {
      isOnTime = false;
    }, 100);
  })

  // Now we'll need to return a duplex stream, we'll use `duplexify` for it.
  return duplexify.obj(incoming, incoming.pipe(outgoing));
}

// And the last thing that is left to do, is to compose all the services using Mue
// Note: That the order of the microservices doesn't matter.
var hub = Mue({objectMode: true}, LoggerService(), CucumberProducer(), TomatoProducer(), VeggieConsumer());

// Actually there is one more thing. Since our instance of `Mue` is a duplex stream by itself you need to sink the
// data somewhere, otherwise it won't work. So we'll simply sink it to nothing.
hub.on('data', function (){});

// And we're done...

/*
  Potential outputs:
    Option 1:
     LOGGING >> I got a Cucumber
     LOGGING >> I got a Tomato

    Option 2:
     LOGGING >> I got a Cucumber
     LOGGING >> Too bad I won't eat Tomato today.
 */