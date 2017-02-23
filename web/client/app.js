'use strict';

require('@cgross/angular-busy/dist/angular-busy.min.css');
require('angular-tablesort/tablesort.css');
require('bootstrap/dist/css/bootstrap.min.css');

require('angular');
require('@cgross/angular-busy/dist/angular-busy.min.js');
require('angularjs-scroll-glue/src/scrollglue.js');
require('angular-css');
require('angular-route');
require('angular-tablesort');
require('angular-ui-bootstrap/dist/ui-bootstrap-tpls.js');
require('alertify.js/dist/js/ngAlertify.js');
require('ion-sound/js/ion.sound.min.js');
var jsSHA256 = require('js-sha256/build/sha256.min.js');
var v = require('voca');

var app = angular.module('app', ['ngAlertify', 'ngRoute', 'ui.bootstrap', 'cgBusy', 'tableSort', 'angularCSS', 'luegg.directives'])
.service('mafenSession', function($rootScope, $timeout, $q) {
  'ngInject';

  var that = this;

  this.reset = function() {
    that.loginDeferred = $q.defer();
    that.loggedIn = false;
    that.characters = [];
    that.items = [];
    that.meters = {};
    that.attrs = {};
    that.chats = [];
    that.msgs = {};
    that.callbacks = {};
  };

  var onmessage = function(message) {
    var msg = JSON.parse(message.data);

    if (msg.action === 'connect') {
      if (msg.success) {
        that.loggedIn = true;
        that.loginDeferred.resolve();
      } else {
        that.loginDeferred.reject();
      }
    } else if (msg.action === 'character') {
      that.characters.push(msg.name);
    } else if (msg.action === 'item') {
      that.items.push(msg);
    } else if (msg.action === 'destroy') {
      that.items = that.items.filter(function(item) {
        return item.id !== msg.id;
      });
      delete that.meters[msg.id];
    } else if (msg.action === 'attr') {
      that.attrs = msg.attrs;
    } else if (msg.action === 'meter') {
      that.meters[msg.id] = msg.meter;
    } else if (msg.action === 'mchat') {
      that.chats.push({
        id: msg.id,
        name: msg.name
      });
    } else if (msg.action === 'msg') {
      if (that.msgs[msg.chat] === undefined) {
        that.msgs[msg.chat] = [];
      }
      that.msgs[msg.chat].push({
        from: msg.from,
        text: msg.text
      });
    } else {
      // TODO
    }

    var cb = that.callbacks[msg.action];
    if (cb) {
      cb(msg);
    }

    $rootScope.$apply();
  };

  this.waitForConnection = function(callback, interval) {
    if (that.ws.readyState === 1) { // OPEN
      callback();
    } else {
      $timeout(function() {
        that.waitForConnection(callback, interval);
      }, interval);
    }
  };

  this.connect = function(addr) {
    that.ws = new WebSocket(addr);
    that.ws.onmessage = onmessage;
  };

  this.login = function(username, password) {
    that.send({
      action: 'connect',
      data: {
        username: username,
        password: jsSHA256.sha256(password)
      }
    });
    return that.loginDeferred.promise;
  };

  this.send = function(data) {
    // To avoid "Error: Failed to execute 'send' on 'WebSocket': Still in CONNECTING state"
    that.waitForConnection(function() {
      that.ws.send(JSON.stringify(data));
    }, 1000);
  };

  this.close = function() {
    that.ws.close();
  };

  this.getTotalMW = function() {
    var total = 0;
    for (var i = 0; i < that.items.length; ++i) {
      var item = that.items[i];
      if (item.info.curio && item.study) {
        total += item.info.mw;
      }
    }
    return total;
  };

  this.getProgress = function(id) {
    var progress = '';
    for (var i = 0; i < that.items.length; ++i) {
      var item = that.items[i];
      if (item.id === id) {
        var meter = that.meters[id];
        if (meter !== undefined) {
          var minsLeft = item.info.time * (100 - meter) / 100;
          progress = v.sprintf(
            '%d%% (~%s left)',
            meter,
            $rootScope.minutesToHoursMinutes(minsLeft)
          );
        }
        break;
      }
    }
    return progress;
  };

  this.on = function(msgType, callback) {
    that.callbacks[msgType] = callback;
  };
})
.config(function($routeProvider, $locationProvider) {
  'ngInject';

  var checkLoggedIn = function($q, $location, mafenSession) {
    'ngInject';

    var deferred = $q.defer();

    if (mafenSession.loggedIn) {
      deferred.resolve();
    } else {
      deferred.reject();
      $location.url('/login');
    }

    return deferred.promise;
  };

  $routeProvider
    .when('/', {
      templateUrl: 'main.html',
      controller: 'MainCtrl',
      css: 'main.css',
      resolve: {
        loggedin: checkLoggedIn
      }
    })
    .when('/login', {
      templateUrl: 'login.html',
      controller: 'LoginCtrl',
      css: ['login.css', 'ribbons.css', 'hue.css']
    })
    .otherwise({
      redirectTo: '/'
    });

  ion.sound({
    sounds: [{
      name: 'button_tiny'
    }],
    path: 'sounds/'
  });
})
.run(function($rootScope, $location, mafenSession) {
  'ngInject';

  $rootScope.minutesToHoursMinutes = function(totalMins) {
    var hours = Math.floor(totalMins / 60);
    var minutes = totalMins % 60;
    return hours + ':' + parseInt(minutes, 10);
  };

  $rootScope.findFirstWithProp = function(arr, prop, val) {
    return arr.filter(function(obj) {
      return obj[prop] === val;
    })[0];
  };

  $rootScope.logout = function() {
    mafenSession.close();
    mafenSession.loggedIn = false;
    $location.url('/login');
  };
});

app.controller('LoginCtrl', function($scope, $uibModal, mafenSession, alertify) {
  'ngInject';

  $scope.mafenSession = mafenSession;

  $scope.user = {};

  $scope.login = function() {
    $scope.mafenSession.reset();
    $scope.mafenSession.connect('ws://mafen.club:8000');
    $scope.loginPromise = $scope.mafenSession.login($scope.user.username, $scope.user.password);
    $scope.loginPromise.then(function() {
      $uibModal.open({
        ariaLabelledBy: 'charlist-modal-title',
        ariaDescribedBy: 'charlist-modal-body',
        templateUrl: 'charlist.html',
        controller: 'CharacterListModalCtrl'
      });
    }, function() {
      alertify.error('Authentication failed');
    });
  };
});

app.controller('MainCtrl', function($rootScope, $scope, mafenSession) {
  'ngInject';

  $scope.mafenSession = mafenSession;

  $scope.inputMsgs = {};

  $scope.transferItem = function(id) {
    $scope.mafenSession.send({
      action: 'transfer',
      data: {
        id: id
      }
    });
  };

  $scope.sendMsg = function(chatId) {
    $scope.mafenSession.send({
      action: 'msg',
      data: {
        id: chatId,
        msg: $scope.inputMsgs[chatId]
      }
    });
    $scope.inputMsgs[chatId] = '';
  };

  $scope.getChat = function(chatId) {
    return $rootScope.findFirstWithProp($scope.mafenSession.chats, 'id', chatId);
  };

  $scope.mafenSession.on('msg', function(msg) {
    if (msg.from !== 'You') {
      ion.sound.play('button_tiny');
    }

    var activeChat = $scope.getChat($scope.activeChatId);
    if (activeChat.id !== msg.chat) {
      var chat = $scope.getChat(msg.chat);
      chat.unread = true;
    }
  });

  $scope.onChatSelect = function(chatId) {
    $scope.activeChatId = chatId;
    var chat = $scope.getChat(chatId);
    chat.unread = false;
  };
});

app.controller('CharacterListModalCtrl', function($scope, $location, $uibModalInstance, mafenSession) {
  'ngInject';

  $scope.mafenSession = mafenSession;

  $scope.chooseCharacter = function(character) {
    $scope.mafenSession.send({
      action: 'play',
      data: {
        char_name: character
      }
    });
    $scope.close();
    $location.url('/');
  };

  $scope.close = function() {
    $uibModalInstance.dismiss('cancel');
  };
});
