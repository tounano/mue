'use strict';

var Mue         = require('../index').Mue
  , MueRequest  = require('../index').MueRequest
  , Plug        = require('../index').Plug
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