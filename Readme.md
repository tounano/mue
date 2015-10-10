# Mue - Microservices unframework

Set of utilities to create `Microservices` out of streams.

**Note: This is experimental. I'm taking someones advise of sharing my failures (or successes) with the world :)**
Hopefully, by version `0.1.x` the API will be finalized. If you like the concept, shoot me an `issue`.

## The "why?"

After developing several projects with `Microservices` I realized that most of the conversation and frameworks that
deal with `Microservices` focus whether on deployment of microservices or the transport/communication layer rather than
 the contracts (messages) that are being passed between microservices.

Such methods leave a strong footprint on your application and business logic, which strongly couples your implementation
to the frameworks.

The way I want to create microservices is by creating `smart components` that are unaware of the communication pipes and
don't have any idea about where they're being deployed.

I want to be able to compose those `smart components` on the same node or in other nodes.

And finally, I want to take advantage of other `npm` modules to empower my components.

## The "how?"

In every talk/article about Microservices, you hear this quote about Unix philosophy:

> Write programs that do one thing and do it well.
> Write programs to work together.
> Write programs to handle text streams, because that is a universal interface.

And in `Node` language it means `Streams` (also in unix language).

Every `Microservice` is a duplex stream that receives messages of certain types and sends messages of other types.

That way, we can take advantage of all the existing modules that deal with streams.

`Mue` is here only to provide easy tools that would help you to compose those streams into a new stream which you'll
be able to pipe to any stream of your choice.

## quick example

A quick example that implements the "I Need" pattern that is described by Fred George in
[this video](https://www.youtube.com/watch?v=yPf5MfOZPY0).

```js
'use strict';

var Mue       = require('mue').Mue
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
// We'll create a simple message exchange where the consumer will send a message that states "I_NEED_VEGGIES".
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
  // So far we've been using Through/transform streams. The stream receives a message and transforms it to another
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
```

## API

As of today, the api is experimental and would be finalized by version 0.1.

### Mue([options,], spoke [, spoke2, spoke3...])

This function creates a duplex stream that follows the Message Hub pattern. Every message that would be written
into the stream would be written to all the spokes.

Every message that would go out of any spoke, would be written to all the other spokes and to the `readable/outgoing`
stream of the hub.

**Arguments:**

  * `options` (optional) - Options for a stream. Basically pass `{objectMode: true}`
  * `spoke` - a stream that would handle and dispatch messages.

**Return Value:**

Duplex stream.

**Usage:**

```js
  var Mue = require('mue').Mue;
  var hub = Mue({objectMode: true}, Service1(), Service2());

  // If you're not going to pipe it to an external stream, you need to sink it, so that the sink would pull messages
  // from it
  hub.on('data', function (){});
```

### Plug(spoke)

If your service is not a stream and you simply want to write messages to the hub, you'll need to wrap a `through`
stream using a Plug.

All the requests would be sent to the through stream.

The message hub is dumb, it routes messages to all the spokes except of the origin spoke. The responsibility of
whether to act on a message or not is up to the spoke. So what happens is, if your spoke is a `through` stream, it will
resend everything that goes in. Which will lead to an infinite recursion in some cases.

Please see the `Rest-Server` example to understand better how to use `Plug`.

**Usage:**

```js
var Plug = require('mue').Plug;

function ExternalService() {
  var spoke = through.obj();

  spoke.write('whatever you want');

  return Plug(spoke);
}
```

### MueRequest(onRequest, onMessage, spoke[, arg1, arg2,...], cb)

MueRequest encapsulates the process of doing `Request/Reply` pattern on a message hub. As of this version,
the functionality is not complete. It needs to work with `Correlation Ids`, read more on that in the `Todos` section.

This version is just a proof of concept. It would be complete by version `0.1`.

It's highly recommended to do `partial application` on MueRequest.

**Arguments:**

  * `onRequest` - a function of `function (cb[, arg1, arg2, arg3...])`
    * This function should return the value of the message to write to the spoke.
    * `cb` is there in order to finish the request early. You can set timeouts here.
  * `onMessage` - a function of `function (msg, cb[, arg1, arg2, arg3..])`
    * This message would be called every time that something would be written to the spoke.
    * The responsibility of this function is to decide whether the current message is the response for the request.
    * call `cb` with the result.
    * once `cb` is called, `onMessage` won't be called again.
  * `spoke` - a stream that is connected to the hub
  * `cb` - standard async cb.

**Usage:**

See the advanced example for more information.

```js
var MueRequest = require('mue').MueRequest;

// Doing partial application is recommended
var myRequestor = MueRequest.bind(null,
  function _onRequest(cb, arg1, arg2) {
    return {
      arg1: arg1,
      arg2: arg2
    }
  },
  function _onMessage(msg, cb, arg1, arg2) {
    if (msg.type !== "MY DESIRED TYPE") return;
    cb(null, msg);
  }
);


// Now you can use `myRequestor`
myRequestor(hub, "A", "b", function (err, msg) {
  console.log(err, msg);
}
```

## advanced example

This example creates a simple Rest Server component that performs some standard CRUD.

```js
'use strict';

var Mue         = require('mue').Mue
  , MueRequest  = require('mue').MueRequest
  , Plug        = require('mue').Plug
  , express     = require('express')
  , through     = require('through2')
  , duplexify   = require('duplexify')
  ;

// We're going to create a Simple REST app for adding dogs and retrieving the list of dogs using the REST interface.

// This time let's be more organized than the `simple` example. Let's define our message types.
var types = {
  LOG: "system/LOG",
  ADD_DOG: "command/ADD_DOG",
  // Let's define a domain event that would indicate a change in our domain.
  DOG_ADDED: "events/DOG_ADDED",
  I_NEED_DOGS: "query/I_NEED_DOGS",
  LIST_OF_DOGS: "document/LIST_OF_DOGS"
}

// The namespacing is an important pattern in messaging. It would be explained in the final release.
// For more information you can read: http://www.enterpriseintegrationpatterns.com/patterns/messaging/MessageConstructionIntro.html

// Now, it can be exhausting passing messages, so let's create factories for those.
var messages = {
  log: function (log) {
    return {
      type: types.LOG,
      log: log
    }
  },
  addDog: function (dog) {
    // Quick validation might come here...
    return {
      type: types.ADD_DOG,
      dog: dog
    }
  },
  emitDogAdded: function (dogId) {
    return {
      type: types.DOG_ADDED,
      dogId: dogId
    }
  },
  askForDogs: function () {
    return {
      type: types.I_NEED_DOGS
    }
  },
  listOfDogs: function (dogs) {
    return {
      type: types.LIST_OF_DOGS,
      dogs: dogs
    }
  }
}

// PLEASE NOTE: That all this ceremony in order to accomplish a simple thing is not required, however it's recommended.
// There are ways to speed up things. I'm doing it here the long way.

// Now, let's copy our LoggerService from the `simple` example and modify it to meet our standards.
function LoggerService() {
  return through.obj(function (msg, enc, cb) {
    if (msg.type !== types.LOG) return cb();

    console.log("LOGGING >>", msg.log);
    cb();
  })
}

// Now let's store our dogs in a local variable in the application state.
var dogs = [];

// Next thing would be to create the DogsListService.
function DogsListService() {
  return through.obj(function (msg, enc, cb) {
    if (msg.type !== types.I_NEED_DOGS) return cb();

    // Let's make it async as IO should be in real life
    setTimeout(function () {
      this.push(messages.listOfDogs(dogs));
      cb();
    }.bind(this),10);
  });
}

// Now for the DogAdderService
function DogAdderService() {
  return through.obj(function (msg, enc, cb) {
    if (msg.type !== types.ADD_DOG) return cb();

    // VALIDATION SHOULD COME HERE

    setTimeout(function () {
      dogs.push(msg.dog);

      // And now, we have a change in our domain, we should notify about it.
      this.push(messages.emitDogAdded(dogs.length-1));
      cb();
    }.bind(this),10);
  });
}

// We have several things left, we should create now a REST server using Express. Now, there are several ways
// to integrate express as a microservice. I'm going to show one way. There are several more.
//
// The way we'll do it, is that on every express request it would send an async request to the message hub.
// In order to do Async Requests to the message hub, we'll use `MueRequest` which encapsulates the process
// of sending a message and waiting for a reply.

// As of now, `MueRequest` is not perfect. Basically, if we have 2 concurrent requests with the same contract,
// `MueRequest` won't be able to attach the matching response to the consumer who requested it. In order to do
// that, we should use something called `Correlation Ids`. Correlation Ids would be introduced before v. 0.1.

// Let's define our first Async Request.
// We're going to do partial application on the MueRequest function.
// Please read the full signature in the documentation.
var addDog = MueRequest.bind(null,
  function (cb, dog) {
    return messages.addDog(dog)
  },
  function (msg, cb) {
    if (msg.type !== types.DOG_ADDED) return;
    cb(null, {id: msg.dogId})
  }
);

// And another one
var requestDogs = MueRequest.bind(null,
  messages.askForDogs,
  function (msg, cb) {
    if (msg.type !== types.LIST_OF_DOGS) return;
    cb(null, msg)
  }
);

// Before we develop the REST server, there is one thing left. The REST server is not a common MicroService.
// It's not getting it's incoming messages from the message hub. It receives messages from an external source,
// and sends messages to the hub.
// In order to `plug` Express into the hub, we'll use a Plug stream which comes with Mue.

function RestService() {
  // This is the spoke we'll be in touch with. When returning will wrap it with Plug.
  var spoke = through.obj();

  // It's always good to init services on the second tick
  process.nextTick(function () {
    spoke.write(messages.log("STARTING API"));

    var api = express();

    api.get("/dogs", function (req, res) {
      // We can access the hub as a stream
      spoke.write(messages.log("DOGS REQUEST"));

      // or with MueRequest
      requestDogs(spoke, function (err, dogs) {
        res.json({dogs: dogs.dogs});
      })
    })
    api.get("/dogs/add/:type/:name", function (req, res) {
      // Application logic validation should be handled here,
      // Business logic validation should be handled within the DOG ADDING service

      addDog(spoke, {type: req.params.type, name: req.params.name}, function (err, addedDog) {
        res.json(addedDog);
      })
    })

    api.listen(3000);
  });

  // Really important to wrap it with Plug. Otherwise, if you return a through stream, you'll get into a recursion.
  return Plug(spoke);
}

// Now let's plug everything.
var hub = Mue({objectMode: true}, LoggerService(), DogAdderService(), DogsListService(), RestService());
hub.on('data', function (){});

// One more thing...
// Let's add my favorite dogs...
hub.write(messages.addDog({type: "Beagle", name: "Izzy"}));

setTimeout(function () {
  hub.write(messages.addDog({type: "Pit-Bull", name: "Dexter"}));
},1000);

/*
  Now, if you'll navigate to:
    http://127.0.0.1:3000/dogs/add/Swiss-Shepherd/Chaser

  And then to:
    http://127.0.0.1:3000/dogs/

    You'll get:
      {"dogs":[{"type":"Beagle","name":"Izzy"},{"type":"Pit-Bull","name":"Dexter"},{"type":"Swiss-Shepherd","name":"Chaser"}]}
 */
```

## distributed example

The distributed example is not ready yet, however the idea is simple. You simply `pipe` the hub into a socket, and the
socket into the hub.

Also, keep in mind that sockets transfer text and not objects.

```
socket.pipe(jsonify).pipe(hub).pipe(stringify).pipe(socket);
```

You can do it with as many sockets as you want.

Or you can write a duplex stream that wraps the hub and transports it using MQTT/Kafka/Redis/RabbitMQ
 or whatever you'd like to.

## todos

Stuff to get done before version `0.1`

  * Write a distributed sample
  * Use some package to create ids for spokes
  * Standardize the way of handling errors
  * Refactor MueRequest to it's own module. Add support for timeouts and correlationIds.
  * Write an example stream that does smart routing based on pattern matching
  * Implement [correlation ids](http://www.enterpriseintegrationpatterns.com/patterns/messaging/CorrelationIdentifier.html)
  * Implement return path pattern
  * Implement MessageHandlers to create streams faster.

## inspiration

  * Fred George with awesome [videos about microservices](https://www.google.com/search?q=fred+george+microservices&tbm=vid)
  * Robert C. Martin with [this article on microservices](http://blog.cleancoder.com/uncle-bob/2014/09/19/MicroServicesAndJars.html)
    and [this video on architecture](https://www.youtube.com/watch?v=0oGpWmS0aYQ).
  * [Redux](https://github.com/rackt/redux) for being a damn awesome and damn simple state container.
  * [Gulp](http://gulpjs.com/) for bringing Streams into mainstream :)
  * All the stream oriented modules :)

## install

With [npm](http://npmjs.org) do:

```
npm install mue
```

## license

MIT